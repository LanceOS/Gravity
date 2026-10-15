import { and, asc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { env } from '../../../env.js';
import { cycles, projects, teams, tickets } from '../../../db/schema.js';
import { createId, normalizeIsoDate } from '../../../lib/platform.js';

export class CycleError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Accept calendar dates and ISO timestamps with an explicit offset. Date.parse alone
// accepts rolled-over dates such as February 30, so validate the calendar first.
const isoDate = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day
    && Number.isFinite(new Date(value).getTime());
}, 'Must be a real ISO date or timestamp with an offset.');

const cycleName = z.string().trim().min(1).max(255);
export const createCycleSchema = z.strictObject({
  name: cycleName,
  startDate: isoDate,
  endDate: isoDate,
  completed: z.boolean().optional(),
  teamId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});
export const editCycleSchema = createCycleSchema.omit({ teamId: true, projectId: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one cycle field is required.',
);

export function mapCycle(cycle: typeof cycles.$inferSelect) {
  return {
    id: cycle.id,
    name: cycle.name,
    startDate: normalizeIsoDate(cycle.startDate),
    endDate: normalizeIsoDate(cycle.endDate),
    completed: cycle.completed ? 1 : 0,
  };
}

function dates(input: { startDate: string; endDate: string }) {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (startDate >= endDate) throw new CycleError('startDate must be before endDate.', 400);
  return { startDate, endDate };
}

type WriteTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockTeam(tx: WriteTx, teamId: string) {
  const [team] = await tx.select({ id: teams.id, workspaceId: teams.workspaceId })
    .from(teams).where(eq(teams.id, teamId)).for('update');
  if (!team) throw new CycleError('Team not found.', 404);
  return team;
}

/**
 * Active (not completed) cycles of one team occupy half-open [start, end)
 * intervals. Touching endpoints are allowed. Locking the team row serializes
 * all cycle create/edit/reopen/delete transactions for that team.
 */
async function assertNoActiveOverlap(tx: WriteTx, teamId: string, startDate: Date, endDate: Date, excludeId?: string) {
  const [overlap] = await tx.select({ id: cycles.id }).from(cycles).where(and(
    eq(cycles.teamId, teamId), eq(cycles.completed, false),
    lt(cycles.startDate, endDate), gt(cycles.endDate, startDate),
    excludeId ? ne(cycles.id, excludeId) : undefined,
  )).limit(1);
  if (overlap) throw new CycleError('Active cycle dates overlap another cycle in this team.', 409);
}

/** Call before moving a team's cycles into another team. Both locks use ID order. */
export async function assertCycleTeamTransferAllowed(tx: WriteTx, sourceTeamId: string, targetTeamId: string) {
  const teamIds = [sourceTeamId, targetTeamId].sort();
  const lockedTeams = await tx.select({ id: teams.id }).from(teams)
    .where(inArray(teams.id, teamIds)).orderBy(asc(teams.id)).for('update');
  if (lockedTeams.length !== 2) throw new CycleError('Team not found.', 404);
  const active = await tx.select({ startDate: cycles.startDate, endDate: cycles.endDate })
    .from(cycles).where(and(inArray(cycles.teamId, teamIds), eq(cycles.completed, false)))
    .orderBy(asc(cycles.startDate), asc(cycles.endDate));
  let latestEnd = Number.NEGATIVE_INFINITY;
  for (const cycle of active) {
    if (cycle.startDate.getTime() < latestEnd) {
      throw new CycleError('Moving cycles would overlap active dates in the target team.', 409);
    }
    latestEnd = cycle.endDate.getTime();
  }
}

export async function getCycleRecord(cycleId: string) {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
  return cycle ?? null;
}

export async function createCycleRecord(teamId: string, input: z.infer<typeof createCycleSchema>, projectId?: string) {
  const range = dates(input);
  return db.transaction(async (tx) => {
    const team = await lockTeam(tx, teamId);
    if (projectId) {
      // This read is inside the transaction and holds a share lock. A project
      // transfer cannot make a cached team lookup stale between validation and insert.
      const [project] = await tx.select({ teamId: projects.teamId, workspaceId: projects.workspaceId })
        .from(projects).where(eq(projects.id, projectId)).for('share');
      if (!project || project.teamId !== teamId || project.workspaceId !== team.workspaceId) {
        throw new CycleError('Team does not own this project.', 409);
      }
    }
    if (!input.completed) await assertNoActiveOverlap(tx, teamId, range.startDate, range.endDate);
    const [cycle] = await tx.insert(cycles).values({
      id: createId('c'), teamId, name: input.name, ...range,
      completed: input.completed ?? false,
      progressTrackedAt: env.databaseUrl.startsWith('pgmem://') ? sql`now()` : sql`clock_timestamp()`,
    }).returning();
    return cycle;
  });
}

export async function editCycleRecord(teamId: string, cycleId: string, input: z.infer<typeof editCycleSchema>) {
  return db.transaction(async (tx) => {
    await lockTeam(tx, teamId);
    const [current] = await tx.select().from(cycles)
      .where(and(eq(cycles.id, cycleId), eq(cycles.teamId, teamId))).limit(1);
    if (!current) throw new CycleError('Cycle not found in this team.', 404);
    const range = dates({
      startDate: input.startDate ?? current.startDate.toISOString(),
      endDate: input.endDate ?? current.endDate.toISOString(),
    });
    const completed = input.completed ?? current.completed;
    if (!completed) await assertNoActiveOverlap(tx, teamId, range.startDate, range.endDate, cycleId);
    const [cycle] = await tx.update(cycles).set({
      name: input.name ?? current.name, ...range, completed,
    }).where(and(eq(cycles.id, cycleId), eq(cycles.teamId, teamId))).returning();
    return cycle;
  });
}

export async function deleteCycleRecord(teamId: string, cycleId: string) {
  try {
    return await db.transaction(async (tx) => {
      await lockTeam(tx, teamId);
      // Ticket assignment takes a cycle row lock before it writes. This lock
      // makes the reference check and deletion atomic with API assignments.
      const [cycle] = await tx.select({ id: cycles.id }).from(cycles)
        .where(and(eq(cycles.id, cycleId), eq(cycles.teamId, teamId))).for('update');
      if (!cycle) throw new CycleError('Cycle not found in this team.', 404);
      const [assigned] = await tx.select({ id: tickets.id }).from(tickets).where(eq(tickets.cycleId, cycleId)).limit(1);
      if (assigned) throw new CycleError('Cannot delete a cycle while tickets are assigned.', 409);
      await tx.delete(cycles).where(and(eq(cycles.id, cycleId), eq(cycles.teamId, teamId)));
    });
  } catch (error) {
    // A direct SQL assignment can race after the pre-delete check. The FK is
    // authoritative; preserve the same conflict response when it catches one.
    const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : error;
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23503'
      && 'constraint' in cause && cause.constraint === 'tickets_cycle_id_cycles_id_fk') {
      throw new CycleError('Cannot delete a cycle while tickets are assigned.', 409);
    }
    throw error;
  }
}
