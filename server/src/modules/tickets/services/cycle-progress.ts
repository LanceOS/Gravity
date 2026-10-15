import { and, asc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { cycleProgressDailyDeltas, cycleProgressEvents, cycles, projects, teams, tickets } from '../../../db/schema.js';
import { env } from '../../../env.js';

type WriteTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CycleState = { cycleId: string | null; status: string } | null;
type Transition = { ticketId: string; before: CycleState; after: CycleState };
type ProgressEvent = typeof cycleProgressEvents.$inferInsert;

const statuses = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] as const;
type Breakdown = Record<(typeof statuses)[number], number>;

function cycleStatus(value: string) {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
  if (normalized === 'cancelled') return 'canceled';
  return statuses.includes(normalized as (typeof statuses)[number]) ? normalized : 'todo';
}

function isDone(value: string) { return cycleStatus(value) === 'done'; }

function counts(groups: Iterable<{ status: string; count: number }>) {
  const statusBreakdown = Object.fromEntries(statuses.map(status => [status, 0])) as Breakdown;
  let total = 0;
  for (const { status, count } of groups) {
    const canonical = cycleStatus(status);
    total += Number(count);
    statusBreakdown[canonical as keyof Breakdown] += Number(count);
  }
  const completed = statusBreakdown.done;
  return { total, completed, remaining: total - completed, statusBreakdown };
}

/** Record only real membership/status transitions, in the same transaction as the ticket write. */
export async function recordCycleProgressTransitions(tx: WriteTx, transitions: Transition[]) {
  const changed = transitions.filter(({ before, after }) =>
    before?.cycleId !== after?.cycleId || (before?.cycleId && before.status !== after?.status));
  if (!changed.length) return;
  const cycleIds = [...new Set(changed.flatMap(({ before, after }) =>
    [before?.cycleId, after?.cycleId].filter((id): id is string => !!id)))].sort();
  if (!cycleIds.length) return;

  // The cycle row lock serializes writes from different projects in its team.
  // A legacy cycle gets a baseline immediately before its first transition;
  // dates before that instant remain explicitly unavailable.
  const timestamp = env.databaseUrl.startsWith('pgmem://') ? sql<Date>`now()` : sql<Date>`clock_timestamp()`;
  const lockedRows = await tx.select({ cycle: cycles, recordedAt: timestamp }).from(cycles).where(inArray(cycles.id, cycleIds))
    .orderBy(asc(cycles.id)).for('update');
  if (lockedRows.length !== cycleIds.length) throw new Error('TICKET_CYCLE_SCOPE_VIOLATION');
  const now = lockedRows[lockedRows.length - 1].recordedAt;
  const locked = lockedRows.map(row => row.cycle);
  const events: ProgressEvent[] = [];
  for (const cycle of locked) {
    if (cycle.progressTrackedAt) continue;
    const [team] = await tx.select({ workspaceId: teams.workspaceId }).from(teams)
      .where(eq(teams.id, cycle.teamId)).limit(1);
    if (!team) throw new Error('TICKET_CYCLE_SCOPE_VIOLATION');
    const current = await tx.select({ id: tickets.id, status: tickets.status })
      .from(tickets).innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(and(eq(tickets.cycleId, cycle.id), eq(projects.teamId, cycle.teamId),
        eq(projects.workspaceId, team.workspaceId)))
      .orderBy(asc(tickets.id));
    await tx.update(cycles).set({ progressTrackedAt: now })
      .where(and(eq(cycles.id, cycle.id), isNull(cycles.progressTrackedAt)));
    for (const ticket of current) events.push({
      cycleId: cycle.id, ticketId: ticket.id, status: cycleStatus(ticket.status), recordedAt: now,
      deltaTotal: 1, deltaCompleted: isDone(ticket.status) ? 1 : 0,
    });
  }

  for (const { ticketId, before, after } of changed) {
    if (before?.cycleId === after?.cycleId) {
      if (after?.cycleId) events.push({ cycleId: after.cycleId, ticketId, status: after.status, recordedAt: now,
        deltaTotal: 0, deltaCompleted: Number(isDone(after.status)) - Number(before && isDone(before.status)) });
      continue;
    }
    if (before?.cycleId) events.push({ cycleId: before.cycleId, ticketId, status: null, recordedAt: now,
      deltaTotal: -1, deltaCompleted: isDone(before.status) ? -1 : 0 });
    if (after?.cycleId) events.push({ cycleId: after.cycleId, ticketId, status: after.status, recordedAt: now,
      deltaTotal: 1, deltaCompleted: isDone(after.status) ? 1 : 0 });
  }
  for (let offset = 0; offset < events.length; offset += 1000) {
    await tx.insert(cycleProgressEvents).values(events.slice(offset, offset + 1000));
  }
  const day = now.toISOString().slice(0, 10);
  const deltasByCycle = new Map<string, { total: number; completed: number }>();
  for (const event of events) {
    const delta = deltasByCycle.get(event.cycleId) ?? { total: 0, completed: 0 };
    delta.total += event.deltaTotal;
    delta.completed += event.deltaCompleted;
    deltasByCycle.set(event.cycleId, delta);
  }
  for (const [cycleId, delta] of deltasByCycle) {
    if (delta.total === 0 && delta.completed === 0) continue;
    await tx.insert(cycleProgressDailyDeltas).values({
      cycleId, day, deltaTotal: delta.total, deltaCompleted: delta.completed,
    }).onConflictDoUpdate({
      target: [cycleProgressDailyDeltas.cycleId, cycleProgressDailyDeltas.day],
      set: {
        deltaTotal: sql`${cycleProgressDailyDeltas.deltaTotal} + ${delta.total}`,
        deltaCompleted: sql`${cycleProgressDailyDeltas.deltaCompleted} + ${delta.completed}`,
      },
    });
  }
}

export async function getCycleProgress(cycleId: string, expectedTeamId: string) {
  // PostgreSQL fixes all three reads to one MVCC snapshot. pg-mem does not
  // implement transaction isolation settings, so its tests use the default.
  return db.transaction(async (tx) => {
    const timestamp = env.databaseUrl.startsWith('pgmem://') ? sql<Date>`now()` : sql<Date>`clock_timestamp()`;
    const [row] = await tx.select({ cycle: cycles, workspaceId: teams.workspaceId, asOf: timestamp }).from(cycles)
      .innerJoin(teams, eq(teams.id, cycles.teamId))
      .where(and(eq(cycles.id, cycleId), eq(cycles.teamId, expectedTeamId))).limit(1);
    if (!row) return null;
    const { cycle, workspaceId, asOf } = row;
    const current = await tx.select({ status: tickets.status, count: sql<number>`count(*)` }).from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(and(eq(tickets.cycleId, cycle.id), eq(projects.teamId, cycle.teamId),
        eq(projects.workspaceId, workspaceId)))
      .groupBy(tickets.status);
    const cutoff = new Date(Math.min(cycle.endDate.getTime(), asOf.getTime()));
    const cutoffDay = cutoff.toISOString().slice(0, 10);
    const cutoffDayStart = new Date(`${cutoffDay}T00:00:00.000Z`);
    const partialDay = cutoff.getTime() > cutoffDayStart.getTime();
    const rollups = cycle.progressTrackedAt && cycle.progressTrackedAt < cutoff
      ? await tx.select().from(cycleProgressDailyDeltas)
        .where(and(eq(cycleProgressDailyDeltas.cycleId, cycle.id), lt(cycleProgressDailyDeltas.day, cutoffDay)))
        .orderBy(asc(cycleProgressDailyDeltas.day))
      : [];
    const [partial] = cycle.progressTrackedAt && cycle.progressTrackedAt < cutoff && partialDay
      ? await tx.select({
        deltaTotal: sql<number>`coalesce(sum(${cycleProgressEvents.deltaTotal}), 0)`,
        deltaCompleted: sql<number>`coalesce(sum(${cycleProgressEvents.deltaCompleted}), 0)`,
      }).from(cycleProgressEvents)
        .where(and(eq(cycleProgressEvents.cycleId, cycle.id), gte(cycleProgressEvents.recordedAt, cutoffDayStart),
          asOf.getTime() < cycle.endDate.getTime()
            ? lte(cycleProgressEvents.recordedAt, cutoff)
            : lt(cycleProgressEvents.recordedAt, cutoff)))
      : [{ deltaTotal: 0, deltaCompleted: 0 }];
    const summary = counts(current);
    const historyAvailableFrom = cycle.progressTrackedAt?.toISOString() ?? null;
    const historyUnavailableBefore = !cycle.progressTrackedAt || cycle.progressTrackedAt > cycle.startDate;
    const dailyRemaining: Array<{ date: string; total: number; completed: number; remaining: number }> = [];

    if (cycle.progressTrackedAt) {
      const first = new Date(Math.max(cycle.startDate.getTime(), cycle.progressTrackedAt.getTime()));
      const last = cutoff.getTime();
      let total = 0;
      let completed = 0;
      let rollupIndex = 0;
      const day = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
      while (day.getTime() < last) {
        const date = day.toISOString().slice(0, 10);
        while (rollupIndex < rollups.length && rollups[rollupIndex].day <= date) {
          total += rollups[rollupIndex].deltaTotal;
          completed += rollups[rollupIndex].deltaCompleted;
          rollupIndex += 1;
        }
        if (partialDay && date === cutoffDay) {
          total += Number(partial?.deltaTotal ?? 0);
          completed += Number(partial?.deltaCompleted ?? 0);
        }
        dailyRemaining.push({ date, total, completed, remaining: total - completed });
        day.setUTCDate(day.getUTCDate() + 1);
      }
    }

    return { cycleId: cycle.id, summary, historyAvailableFrom, historyUnavailableBefore, dailyRemaining };
  }, env.databaseUrl.startsWith('pgmem://') ? undefined : { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
