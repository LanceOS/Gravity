import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { comments, tickets } from '../db/schema.js';
import { createId, getProjectByKeyPrefix, nextTicketKey, normalizeIsoDate } from '../lib/platform.js';

type TicketRecord = typeof tickets.$inferSelect;

export type TicketFilters = {
  status?: string;
  priority?: string;
  domainId?: string;
  assigneeId?: string;
  cycleId?: string;
};

function mapTicket(record: TicketRecord) {
  return {
    id: record.id,
    key: record.key,
    title: record.title,
    description: record.description,
    status: record.status,
    priority: record.priority,
    assigneeId: record.assigneeId,
    projectId: record.projectId,
    domainId: record.domainId,
    cycleId: record.cycleId,
    parentId: record.parentId,
    prStatus: record.prStatus,
    prUrl: record.prUrl,
    createdAt: normalizeIsoDate(record.createdAt),
    updatedAt: normalizeIsoDate(record.updatedAt),
  };
}

export async function listTickets(projectId: string, filters: TicketFilters = {}) {
  const conditions = [eq(tickets.projectId, projectId)];

  if (filters.status) {
    conditions.push(eq(tickets.status, filters.status));
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

  const rows = await db.select().from(tickets).where(and(...conditions)).orderBy(asc(tickets.createdAt));
  return rows.map(mapTicket);
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
  const result = await db.execute(
    // sql generated here keeps the auth user join explicit without duplicating a large relation model.
    {
      sql: `
        SELECT
          c.id,
          c.ticket_id AS "ticketId",
          c.user_id AS "userId",
          c.body,
          c.created_at AS "createdAt",
          u.name AS "userName",
          COALESCE(up.avatar_url, u.image, '') AS "userAvatar"
        FROM comments c
        JOIN "user" u ON u.id = c.user_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE c.ticket_id = $1
        ORDER BY c.created_at ASC
      `,
      params: [ticketId],
    } as never,
  );

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    ticketId: String(row.ticketId),
    userId: String(row.userId),
    body: String(row.body),
    createdAt: normalizeIsoDate(row.createdAt),
    userName: String(row.userName ?? ''),
    userAvatar: String(row.userAvatar ?? ''),
  }));
}

export async function getTicketDetails(ticketId: string, projectId?: string) {
  const ticket = await getTicketById(ticketId, projectId);
  if (!ticket) {
    return null;
  }

  const [ticketComments, subtasks] = await Promise.all([
    listComments(ticket.id),
    db.select().from(tickets).where(eq(tickets.parentId, ticket.id)),
  ]);

  return {
    ...ticket,
    comments: ticketComments,
    subtasks: subtasks.map(mapTicket),
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
}) {
  const key = await nextTicketKey(input.projectId);
  const rows = await db
    .insert(tickets)
    .values({
      id: createId('ti'),
      key,
      title: input.title,
      description: input.description ?? '',
      status: input.status ?? 'todo',
      priority: input.priority ?? 'no_priority',
      projectId: input.projectId,
      domainId: input.domainId ?? null,
      cycleId: input.cycleId ?? null,
      assigneeId: input.assigneeId ?? null,
      parentId: input.parentId ?? null,
      prStatus: 'none',
      prUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
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
  }>,
  projectId?: string,
) {
  const payload = {
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
    ...(updates.assigneeId !== undefined ? { assigneeId: updates.assigneeId } : {}),
    ...(updates.domainId !== undefined ? { domainId: updates.domainId } : {}),
    ...(updates.cycleId !== undefined ? { cycleId: updates.cycleId } : {}),
    ...(updates.parentId !== undefined ? { parentId: updates.parentId } : {}),
    ...(updates.prStatus !== undefined ? { prStatus: updates.prStatus } : {}),
    ...(updates.prUrl !== undefined ? { prUrl: updates.prUrl } : {}),
    updatedAt: new Date(),
  };

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

  await db.delete(comments).where(eq(comments.ticketId, ticketId));
  await db.delete(tickets).where(eq(tickets.parentId, ticketId));
  await db.delete(tickets).where(eq(tickets.id, ticketId));
  return true;
}

export async function addCommentRecord(ticketId: string, userId: string, body: string) {
  await db.insert(comments).values({
    id: createId('co'),
    ticketId,
    userId,
    body,
    createdAt: new Date(),
  });

  const allComments = await listComments(ticketId);
  return allComments[allComments.length - 1] ?? null;
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