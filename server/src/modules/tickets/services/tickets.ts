import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { authUsers, comments, tickets, userProfiles, projects, domains, cycles } from '../../../db/schema.js';
import { createId, getProjectByKeyPrefix, nextTicketKey, normalizeIsoDate } from '../../../lib/platform.js';
import generateBranchName from '../utils/branch.js';

type TicketRecord = typeof tickets.$inferSelect;

export type TicketFilters = {
  status?: string;
  priority?: string;
  domainId?: string;
  assigneeId?: string;
  cycleId?: string;
};

function buildTicketFilterConditions(projectIds: string[], filters: TicketFilters = {}) {
  const conditions = [inArray(tickets.projectId, projectIds)];

  if (filters.status) {
    // Normalize incoming status filter to canonical DB values
    const s = canonicalizeStatus(filters.status);
    conditions.push(eq(tickets.status, s));
  }
  if (filters.priority) {
    conditions.push(eq(tickets.priority, filters.priority));
  }
  if (filters.domainId) {
    conditions.push(eq(tickets.domainId, filters.domainId));
  }
  if (filters.assigneeId) {
    conditions.push(eq(tickets.assigneeId, filters.assigneeId));
  }
  if (filters.cycleId) {
    conditions.push(eq(tickets.cycleId, filters.cycleId));
  }

  return conditions;
}

function mapTicket(record: TicketRecord) {
  return {
    id: record.id,
    key: record.key,
    title: record.title,
    description: record.description,
    status: canonicalizeStatus(record.status),
    priority: record.priority,
    assigneeId: record.assigneeId,
    projectId: record.projectId,
    domainId: record.domainId,
    cycleId: record.cycleId,
    parentId: record.parentId,
    isSubtask: record.parentId !== null,
    prStatus: record.prStatus,
    prUrl: record.prUrl,
    branchName: record.branchName,
    createdAt: normalizeIsoDate(record.createdAt),
    updatedAt: normalizeIsoDate(record.updatedAt),
  };
}

// Normalize status strings to canonical DB/application values.
export function canonicalizeStatus(status?: string | null): string {
  if (!status || typeof status !== 'string') return 'todo';
  const lower = status.toLowerCase().trim();
  const normalized = lower.replace(/[^a-z0-9]+/g, '_');
  const allowed = new Set(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']);
  if (allowed.has(normalized)) return normalized;

  const collapsed = normalized.replace(/_/g, '');
  if (collapsed === 'inprogress') return 'in_progress';
  if (collapsed === 'inreview') return 'in_review';
  if (collapsed === 'cancelled' || collapsed === 'canceled') return 'canceled';
  if (collapsed === 'backlog') return 'backlog';
  if (collapsed === 'done') return 'done';
  if (collapsed === 'todo' || collapsed === 'todo') return 'todo';

  return 'todo';
}

export async function listTickets(projectId: string, filters: TicketFilters = {}) {
  const rows = await db
    .select({ ticket: tickets, projectName: projects.name })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(...buildTicketFilterConditions([projectId], filters)))
    .orderBy(asc(tickets.createdAt));
  return rows.map((r) => ({
    ...mapTicket(r.ticket),
    projectName: r.projectName,
  }));
}

export async function listWorkspaceTickets(projectIds: string[], filters: TicketFilters = {}) {
  if (projectIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({ ticket: tickets, projectName: projects.name })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(...buildTicketFilterConditions(projectIds, filters)))
    .orderBy(asc(tickets.createdAt));
  return rows.map((r) => ({
    ...mapTicket(r.ticket),
    projectName: r.projectName,
  }));
}

export async function getTicketById(ticketId: string, projectId?: string) {
  const rows = await db.select().from(tickets).where(projectId ? and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)) : eq(tickets.id, ticketId)).limit(1);
  return rows[0] ? mapTicket(rows[0]) : null;
}

export async function getTicketByKey(ticketKey: string) {
  const rows = await db.select().from(tickets).where(eq(tickets.key, ticketKey.toUpperCase())).limit(1);
  return rows[0] ? mapTicket(rows[0]) : null;
}

export async function listComments(ticketId: string) {
  const rows = await db
    .select({
      id: comments.id,
      ticketId: comments.ticketId,
      userId: comments.userId,
      body: comments.body,
      createdAt: comments.createdAt,
      userName: authUsers.name,
      userImage: authUsers.image,
      userAvatar: userProfiles.avatarUrl,
      authorRole: userProfiles.role,
    })
    .from(comments)
    .innerJoin(authUsers, eq(authUsers.id, comments.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
    .where(eq(comments.ticketId, ticketId))
    .orderBy(asc(comments.createdAt));

  return rows.map((row) => ({
    id: String(row.id),
    ticketId: String(row.ticketId),
    userId: String(row.userId),
    body: String(row.body),
    createdAt: normalizeIsoDate(row.createdAt),
    userName: String(row.userName ?? ''),
    userAvatar: String(row.userAvatar ?? row.userImage ?? ''),
    author: {
      id: String(row.userId),
      username: String(row.userName ?? ''),
      avatar_url: String(row.userAvatar ?? row.userImage ?? ''),
      role: String(row.authorRole ?? 'guest_contributor'),
    },
  }));
}

export async function getTicketDetails(ticketId: string, projectId?: string) {
  const ticket = await getTicketById(ticketId, projectId);
  if (!ticket) {
    return null;
  }

  const [
    ticketComments,
    subtasks,
    assigneeResult,
    projectResult,
    domainResult,
    cycleResult
  ] = await Promise.all([
    listComments(ticket.id),
    db.select().from(tickets).where(eq(tickets.parentId, ticket.id)),
    ticket.assigneeId
      ? db
          .select({
            id: authUsers.id,
            name: authUsers.name,
            email: authUsers.email,
            avatarUrl: userProfiles.avatarUrl,
            image: authUsers.image,
          })
          .from(authUsers)
          .leftJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
          .where(eq(authUsers.id, ticket.assigneeId))
          .limit(1)
      : Promise.resolve([]),
    db.select().from(projects).where(eq(projects.id, ticket.projectId)).limit(1),
    ticket.domainId
      ? db.select().from(domains).where(eq(domains.id, ticket.domainId)).limit(1)
      : Promise.resolve([]),
    ticket.cycleId
      ? db.select().from(cycles).where(eq(cycles.id, ticket.cycleId)).limit(1)
      : Promise.resolve([]),
  ]);

  const userRow = assigneeResult[0];
  const assignee = userRow
    ? {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        avatarUrl: userRow.avatarUrl ?? userRow.image ?? '',
      }
    : null;

  const projectRow = projectResult[0];
  const project = projectRow
    ? {
        id: projectRow.id,
        name: projectRow.name,
        key: projectRow.key,
        description: projectRow.description,
      }
    : null;

  const domainRow = domainResult[0];
  const domain = domainRow
    ? {
        id: domainRow.id,
        name: domainRow.name,
        color: domainRow.color,
      }
    : null;

  const cycleRow = cycleResult[0];
  const cycle = cycleRow
    ? {
        id: cycleRow.id,
        name: cycleRow.name,
        startDate: normalizeIsoDate(cycleRow.startDate),
        endDate: normalizeIsoDate(cycleRow.endDate),
        completed: cycleRow.completed ? 1 : 0,
      }
    : null;

  return {
    ...ticket,
    comments: ticketComments,
    subtasks: subtasks.map(mapTicket),
    assignee,
    project,
    domain,
    cycle,
  };
}

export async function getTicketDetailsByKey(ticketKey: string) {
  const ticket = await getTicketByKey(ticketKey);
  return ticket ? getTicketDetails(ticket.id, ticket.projectId) : null;
}

export async function createTicketRecord(input: {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  projectId: string;
  domainId?: string | null;
  cycleId?: string | null;
  assigneeId?: string | null;
  parentId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const key = await nextTicketKey(input.projectId);
  const rows = await db
    .insert(tickets)
    .values({
      id: createId('ti'),
      key,
      title: input.title,
      description: input.description ?? '',
      status: canonicalizeStatus(input.status ?? 'todo'),
      priority: input.priority ?? 'no_priority',
      projectId: input.projectId,
      domainId: input.domainId ?? null,
      cycleId: input.cycleId ?? null,
      assigneeId: input.assigneeId ?? null,
      parentId: input.parentId ?? null,
      branchName: generateBranchName(key, input.title),
      prStatus: 'none',
      prUrl: null,
      createdAt: input.createdAt ?? new Date(),
      updatedAt: input.updatedAt ?? input.createdAt ?? new Date(),
    })
    .returning();

  return mapTicket(rows[0]);
}

export async function updateTicketRecord(
  ticketId: string,
  updates: Partial<{
    title: string;
    description: string;
    status: string;
    priority: string;
    assigneeId: string | null;
    domainId: string | null;
    cycleId: string | null;
    parentId: string | null;
    prStatus: string;
    prUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  projectId?: string,
) {
  const payload = {
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    ...(updates.status !== undefined ? { status: canonicalizeStatus(updates.status as string) } : {}),
    ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
    ...(updates.assigneeId !== undefined ? { assigneeId: updates.assigneeId } : {}),
    ...(updates.domainId !== undefined ? { domainId: updates.domainId } : {}),
    ...(updates.cycleId !== undefined ? { cycleId: updates.cycleId } : {}),
    ...(updates.parentId !== undefined ? { parentId: updates.parentId } : {}),
    ...(updates.prStatus !== undefined ? { prStatus: updates.prStatus } : {}),
    ...(updates.prUrl !== undefined ? { prUrl: updates.prUrl } : {}),
    ...(updates.createdAt !== undefined ? { createdAt: updates.createdAt } : {}),
    updatedAt: updates.updatedAt ?? new Date(),
  };

  // If the title changed, regenerate the branch name using the existing ticket key
  if (updates.title !== undefined) {
    const keyRows = await db
      .select({ key: tickets.key })
      .from(tickets)
      .where(projectId ? and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)) : eq(tickets.id, ticketId))
      .limit(1);

    const existingKey = keyRows[0]?.key;
    if (existingKey) {
      (payload as any).branchName = generateBranchName(existingKey, updates.title as string);
    }
  }

  const rows = await db
    .update(tickets)
    .set(payload)
    .where(projectId ? and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)) : eq(tickets.id, ticketId))
    .returning();

  return rows[0] ? mapTicket(rows[0]) : null;
}

export async function deleteTicketRecord(ticketId: string, projectId?: string) {
  const ticket = await getTicketById(ticketId, projectId);
  if (!ticket) {
    return false;
  }

  await db.transaction(async (tx) => {
    await tx.delete(comments).where(eq(comments.ticketId, ticketId));
    await tx.delete(tickets).where(eq(tickets.parentId, ticketId));
    await tx.delete(tickets).where(eq(tickets.id, ticketId));
  });
  
  return true;
}

export async function addCommentRecord(ticketId: string, userId: string, body: string, createdAt?: Date) {
  await db.insert(comments).values({
    id: createId('co'),
    ticketId,
    userId,
    body,
    createdAt: createdAt ?? new Date(),
  });

  const allComments = await listComments(ticketId);
  return allComments[allComments.length - 1] ?? null;
}

export async function updateCommentRecord(commentId: string, ticketId: string, body: string) {
  await db
    .update(comments)
    .set({ body })
    .where(and(eq(comments.id, commentId), eq(comments.ticketId, ticketId)));

  const allComments = await listComments(ticketId);
  return allComments.find((c) => c.id === commentId) ?? null;
}

export async function deleteCommentRecord(commentId: string, ticketId: string) {
  const rows = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.ticketId, ticketId)))
    .limit(1);

  if (rows.length === 0) {
    return false;
  }

  await db.delete(comments).where(eq(comments.id, commentId));
  return true;
}

export async function resolveTicketFromKeyPrefix(ticketKey: string) {
  const prefix = ticketKey.split('-')[0] ?? '';
  const project = await getProjectByKeyPrefix(prefix);
  if (!project) {
    return null;
  }

  const ticket = await getTicketByKey(ticketKey.toUpperCase());
  return ticket && ticket.projectId === project.id ? ticket : null;
}