import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { authUsers, comments, tickets, ticketDependencies, userProfiles, projects, cycles, labels, ticketLabels } from '../../../db/schema.js';
import { createId, getProjectByKeyPrefix, nextTicketKey, normalizeIsoDate } from '../../../lib/platform.js';
import generateBranchName from '../utils/branch.js';

type TicketRecord = typeof tickets.$inferSelect;
type RelatedTicketRecord = {
  id: string;
  key: string;
  title: string;
  projectId: string;
};

export type TicketFilters = {
  status?: string;
  priority?: string;
  assigneeId?: string;
  cycleId?: string;
  labels?: string[];
  labelMode?: 'all' | 'any';
};

function buildTicketFilterConditions(projectIds: string[], filters: TicketFilters = {}) {
  const conditions = [inArray(tickets.projectId, projectIds)];

  if (filters.status) {
    // Normalize incoming status filter to canonical DB values
    const s = canonicalizeStatus(filters.status);
    conditions.push(eq(tickets.status, s));
  }
  if (filters.priority) {
    // Normalize incoming priority filter to canonical DB values
    const p = canonicalizePriority(filters.priority);
    conditions.push(eq(tickets.priority, p));
  }
  if (filters.assigneeId) {
    conditions.push(eq(tickets.assigneeId, filters.assigneeId));
  }
  if (filters.cycleId) {
    conditions.push(eq(tickets.cycleId, filters.cycleId));
  }

  if (filters.labels && filters.labels.length > 0) {
    const subquery = db
      .select({ ticketId: ticketLabels.ticketId })
      .from(ticketLabels)
      .where(inArray(ticketLabels.labelId, filters.labels));

    if (filters.labelMode === 'all') {
      const allSubquery = subquery
        .groupBy(ticketLabels.ticketId)
        .having(sql`count(${ticketLabels.labelId}) = ${filters.labels.length}`);
      conditions.push(inArray(tickets.id, allSubquery));
    } else {
      conditions.push(inArray(tickets.id, subquery));
    }
  }

  return conditions;
}

function mapTicket(record: TicketRecord, labelRows: any[] = []) {
  const sortedLabels = [...labelRows].sort((first, second) => {
    const sortOrderDiff = Number(first.sortOrder ?? 0) - Number(second.sortOrder ?? 0);
    if (sortOrderDiff !== 0) {
      return sortOrderDiff;
    }

    return String(first.name ?? '').localeCompare(String(second.name ?? ''));
  });

  return {
    id: record.id,
    key: record.key,
    title: sanitizeTitle(record.title),
    description: record.description,
    status: canonicalizeStatus(record.status),
    priority: canonicalizePriority(record.priority),
    assigneeId: record.assigneeId,
    projectId: record.projectId,
    cycleId: record.cycleId,
    parentId: record.parentId,
    blockedTicketId: record.blockedTicketId,
    isSubtask: record.parentId !== null,
    prStatus: canonicalizePrStatus(record.prStatus),
    prUrl: record.prUrl,
    branchName: canonicalizeBranchName(record.branchName),
    createdAt: normalizeIsoDate(record.createdAt),
    updatedAt: normalizeIsoDate(record.updatedAt),
    labels: sortedLabels.map((label) => ({
      id: String(label.id),
      teamId: String(label.teamId),
      name: String(label.name),
      color: String(label.color),
      description: String(label.description ?? ''),
      sortOrder: Number(label.sortOrder ?? 0),
    })),
    labelIds: sortedLabels.map((label) => String(label.id)),
  };
}

function mapRelatedTicket(record: RelatedTicketRecord) {
  return {
    id: String(record.id),
    key: String(record.key),
    title: String(record.title),
    projectId: String(record.projectId),
  };
}

async function getProjectScope(projectId: string) {
  const rows = await db
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      teamId: projects.teamId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  return rows[0] ?? null;
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

// Normalize priority strings to canonical DB/application values.
export function canonicalizePriority(priority?: string | null): string {
  if (!priority || typeof priority !== 'string') return 'no_priority';
  const lower = priority.toLowerCase().trim();
  const normalized = lower.replace(/[^a-z0-9]+/g, '_');
  const allowed = new Set(['no_priority', 'low', 'medium', 'high', 'urgent']);
  if (allowed.has(normalized)) return normalized;

  const collapsed = normalized.replace(/_/g, '');
  if (collapsed === 'nopriority' || collapsed === 'none') return 'no_priority';
  if (collapsed === 'urgent') return 'urgent';
  if (collapsed === 'high') return 'high';
  if (collapsed === 'medium') return 'medium';
  if (collapsed === 'low') return 'low';

  // Fallback to no_priority for unrecognized values
  return 'no_priority';
}

// Normalize pull-request status strings to canonical app values.
export function canonicalizePrStatus(prStatus?: string | null): string {
  if (!prStatus || typeof prStatus !== 'string') return 'none';
  const lower = prStatus.toLowerCase().trim();
  const normalized = lower.replace(/[^a-z0-9]+/g, '_');
  const allowed = new Set(['open', 'merged', 'closed', 'none']);
  if (allowed.has(normalized)) return normalized;

  const collapsed = normalized.replace(/_/g, '');
  if (collapsed === 'open') return 'open';
  if (collapsed === 'merged' || collapsed === 'merge') return 'merged';
  if (collapsed === 'closed') return 'closed';

  return 'none';
}

// Normalize and sanitize ticket titles for storage and display.
export function sanitizeTitle(title?: string | null): string {
  if (!title || typeof title !== 'string') return '';
  // Trim, collapse consecutive whitespace, remove control chars, limit length
  const trimmed = title.trim();
  const collapsed = trimmed.replace(/\s+/g, ' ');
  const cleaned = collapsed.replace(/[\x00-\x1F\x7F]+/g, '');
  return cleaned.slice(0, 240);
}

// Normalize branch names to a safe, lower-case form. Preserve slash separators.
export function canonicalizeBranchName(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';
  let s = name.toLowerCase().trim();
  s = s.replace(/\s+/g, '-');
  s = s.replace(/[^a-z0-9\/\-_]+/g, '');
  s = s.replace(/-+/g, '-');
  // Remove hyphens adjacent to slashes introduced by whitespace replacement
  s = s.replace(/-+\//g, '/').replace(/\/-+/g, '/');
  s = s.replace(/(^-+|-+$)/g, '');
  s = s.replace(/\/+/g, '/');
  return s;
}

export async function listTickets(projectId: string, filters: TicketFilters = {}) {
  const rows = await db
    .select({ ticket: tickets, projectName: projects.name })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(...buildTicketFilterConditions([projectId], filters)))
    .orderBy(asc(tickets.createdAt));

  if (rows.length === 0) {
    return [];
  }

  const ticketIds = rows.map((r) => r.ticket.id);
  const allLabels = await db
    .select({
      ticketId: ticketLabels.ticketId,
      label: {
        id: labels.id,
        teamId: labels.teamId,
        name: labels.name,
        color: labels.color,
        description: labels.description,
        sortOrder: labels.sortOrder,
      },
    })
    .from(ticketLabels)
    .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
    .where(inArray(ticketLabels.ticketId, ticketIds));

  const labelsByTicketId = new Map<string, any[]>();
  for (const row of allLabels) {
    const list = labelsByTicketId.get(row.ticketId) ?? [];
    list.push(row.label);
    labelsByTicketId.set(row.ticketId, list);
  }

  return rows.map((r) => ({
    ...mapTicket(r.ticket, labelsByTicketId.get(r.ticket.id) || []),
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

  if (rows.length === 0) {
    return [];
  }

  const ticketIds = rows.map((r) => r.ticket.id);
  const allLabels = await db
    .select({
      ticketId: ticketLabels.ticketId,
      label: {
        id: labels.id,
        teamId: labels.teamId,
        name: labels.name,
        color: labels.color,
        description: labels.description,
        sortOrder: labels.sortOrder,
      },
    })
    .from(ticketLabels)
    .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
    .where(inArray(ticketLabels.ticketId, ticketIds));

  const labelsByTicketId = new Map<string, any[]>();
  for (const row of allLabels) {
    const list = labelsByTicketId.get(row.ticketId) ?? [];
    list.push(row.label);
    labelsByTicketId.set(row.ticketId, list);
  }

  return rows.map((r) => ({
    ...mapTicket(r.ticket, labelsByTicketId.get(r.ticket.id) || []),
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

export async function getTicketRelationsByKey(ticketKey: string) {
  const ticket = await getTicketByKey(ticketKey);
  if (!ticket) {
    return null;
  }

  const [dependenciesResult, blockersResult] = await Promise.all([
    listTicketDependencies(ticket.id),
    listTicketBlockers(ticket.id),
  ]);

  let blockedTicket: ReturnType<typeof mapRelatedTicket> | null = blockersResult[0] ?? null;
  if (!blockedTicket && ticket.blockedTicketId) {
    const legacyBlockedRows = await db
      .select({
        id: tickets.id,
        key: tickets.key,
        title: tickets.title,
        projectId: tickets.projectId,
      })
      .from(tickets)
      .where(eq(tickets.id, ticket.blockedTicketId))
      .limit(1);
    blockedTicket = legacyBlockedRows[0] ? mapRelatedTicket(legacyBlockedRows[0]) : null;
  }

  return {
    ...ticket,
    blockedTicket,
    dependencies: dependenciesResult,
    blockers: blockersResult,
  };
}

export async function listTicketDependencies(ticketId: string) {
  const rows = await db
    .select({
      id: tickets.id,
      key: tickets.key,
      title: tickets.title,
      projectId: tickets.projectId,
    })
    .from(ticketDependencies)
    .innerJoin(tickets, eq(tickets.id, ticketDependencies.blockedTicketId))
    .where(eq(ticketDependencies.ticketId, ticketId))
    .orderBy(asc(tickets.createdAt), asc(tickets.key));

  return rows.map(mapRelatedTicket);
}

export async function listTicketBlockers(ticketId: string) {
  const rows = await db
    .select({
      id: tickets.id,
      key: tickets.key,
      title: tickets.title,
      projectId: tickets.projectId,
    })
    .from(ticketDependencies)
    .innerJoin(tickets, eq(tickets.id, ticketDependencies.ticketId))
    .where(eq(ticketDependencies.blockedTicketId, ticketId))
    .orderBy(asc(tickets.createdAt), asc(tickets.key));

  return rows.map(mapRelatedTicket);
}

export async function hasTicketDependencyRelation(ticketId: string, blockedTicketId: string) {
  const rows = await db
    .select({
      ticketId: ticketDependencies.ticketId,
      blockedTicketId: ticketDependencies.blockedTicketId,
    })
    .from(ticketDependencies)
    .where(and(eq(ticketDependencies.ticketId, ticketId), eq(ticketDependencies.blockedTicketId, blockedTicketId)))
    .limit(1);

  return rows.length > 0;
}

export async function createTicketDependencyRelation(ticketId: string, blockedTicketId: string) {
  await db
    .insert(ticketDependencies)
    .values({ ticketId, blockedTicketId })
    .onConflictDoNothing();
}

export async function removeTicketDependencyRelation(ticketId: string, blockedTicketId: string) {
  await db
    .delete(ticketDependencies)
    .where(and(eq(ticketDependencies.ticketId, ticketId), eq(ticketDependencies.blockedTicketId, blockedTicketId)));
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
    cycleResult,
    labelResult,
    dependenciesResult,
    blockersResult,
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
    ticket.cycleId
      ? db.select().from(cycles).where(eq(cycles.id, ticket.cycleId)).limit(1)
      : Promise.resolve([]),
    db
      .select({
        id: labels.id,
        teamId: labels.teamId,
        name: labels.name,
        color: labels.color,
        description: labels.description,
        sortOrder: labels.sortOrder,
      })
      .from(ticketLabels)
      .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
      .where(eq(ticketLabels.ticketId, ticket.id)),
    listTicketDependencies(ticket.id),
    listTicketBlockers(ticket.id),
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

  // Batch query subtasks labels
  const subtaskIds = subtasks.map(s => s.id);
  const subtaskLabels = subtaskIds.length > 0
    ? await db
        .select({
          ticketId: ticketLabels.ticketId,
          label: {
            id: labels.id,
            teamId: labels.teamId,
            name: labels.name,
            color: labels.color,
            description: labels.description,
            sortOrder: labels.sortOrder,
          }
        })
        .from(ticketLabels)
        .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
        .where(inArray(ticketLabels.ticketId, subtaskIds))
    : [];

  const labelsBySubtaskId = new Map<string, any[]>();
  for (const row of subtaskLabels) {
    const list = labelsBySubtaskId.get(row.ticketId) ?? [];
    list.push(row.label);
    labelsBySubtaskId.set(row.ticketId, list);
  }

  const dependencies = dependenciesResult;
  const blockers = blockersResult;
  let blockedTicket: ReturnType<typeof mapRelatedTicket> | null = blockers[0] ?? null;
  if (!blockedTicket && ticket.blockedTicketId) {
    const legacyBlockedRows = await db
      .select({
        id: tickets.id,
        key: tickets.key,
        title: tickets.title,
        projectId: tickets.projectId,
      })
      .from(tickets)
      .where(eq(tickets.id, ticket.blockedTicketId))
      .limit(1);
    blockedTicket = legacyBlockedRows[0] ? mapRelatedTicket(legacyBlockedRows[0]) : null;
  }

  return {
    ...ticket,
    comments: ticketComments,
    subtasks: subtasks.map((s) => mapTicket(s, labelsBySubtaskId.get(s.id) || [])),
    assignee,
    project,
    cycle,
    labels: labelResult,
    blockedTicket,
    dependencies,
    blockers,
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
  cycleId?: string | null;
  assigneeId?: string | null;
  parentId?: string | null;
  labelIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const key = await nextTicketKey(input.projectId);
  const sanitizedTitle = sanitizeTitle(input.title);
  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(tickets)
      .values({
        id: createId('ti'),
        key,
        title: sanitizedTitle,
        description: input.description ?? '',
        status: canonicalizeStatus(input.status ?? 'todo'),
        priority: canonicalizePriority(input.priority ?? 'no_priority'),
        projectId: input.projectId,
        cycleId: input.cycleId ?? null,
        assigneeId: input.assigneeId ?? null,
        parentId: input.parentId ?? null,
        branchName: generateBranchName(key, sanitizedTitle),
        prStatus: 'none',
        prUrl: null,
        createdAt: input.createdAt ?? new Date(),
        updatedAt: input.updatedAt ?? input.createdAt ?? new Date(),
      })
      .returning();

    const ticketRow = rows[0];
    const projectRows = await tx
      .select({ teamId: projects.teamId })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    const teamId = projectRows[0]?.teamId;

    const uniqueLabelIds = [...new Set((input.labelIds ?? []).filter(Boolean))];
    const createdLabels = uniqueLabelIds.length > 0 && teamId
      ? await tx
          .select({
            id: labels.id,
            teamId: labels.teamId,
            name: labels.name,
            color: labels.color,
            description: labels.description,
            sortOrder: labels.sortOrder,
          })
          .from(labels)
          .where(and(eq(labels.teamId, teamId), inArray(labels.id, uniqueLabelIds)))
      : [];

    if (uniqueLabelIds.length > 0 && createdLabels.length !== uniqueLabelIds.length) {
      throw new Error('One or more labels were not found for this team.');
    }

    if (createdLabels.length > 0) {
      await tx.insert(ticketLabels).values(
        createdLabels.map((label) => ({ ticketId: ticketRow.id, labelId: label.id }))
      );
    }

    return { ticketRow, createdLabels };
  });

  return mapTicket(result.ticketRow, result.createdLabels);
}

export async function updateTicketRecord(
  ticketId: string,
  updates: Partial<{
    title: string;
    description: string;
    status: string;
    priority: string;
    assigneeId: string | null;
    cycleId: string | null;
    parentId: string | null;
    labelIds: string[];
    prStatus: string;
    prUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
  }>,
  projectId?: string,
) {
  const existingRows = await db
    .select()
    .from(tickets)
    .where(projectId ? and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)) : eq(tickets.id, ticketId))
    .limit(1);
  const existingTicket = existingRows[0];
  if (!existingTicket) {
    return null;
  }

  const sourceProject = await getProjectScope(existingTicket.projectId);
  if (!sourceProject) {
    throw new Error(`Project ${existingTicket.projectId} is missing.`);
  }

  const requestedProjectId = typeof updates.projectId === 'string' ? updates.projectId.trim() : '';
  const isProjectMove = requestedProjectId.length > 0 && requestedProjectId !== existingTicket.projectId;
  const targetProject = isProjectMove ? await getProjectScope(requestedProjectId) : sourceProject;
  if (isProjectMove && !targetProject) {
    throw new Error('TARGET_PROJECT_NOT_FOUND');
  }
  if (isProjectMove && targetProject.workspaceId !== sourceProject.workspaceId) {
    throw new Error('TICKET_MOVE_CROSS_WORKSPACE');
  }

  const teamChanged = isProjectMove && targetProject.teamId !== sourceProject.teamId;
  const nextCycleId = teamChanged ? null : updates.cycleId;
  const nextLabelIds = teamChanged
    ? []
    : updates.labelIds !== undefined
      ? [...new Set(updates.labelIds.filter(Boolean))]
      : undefined;

  const payload = {
    ...(updates.title !== undefined ? { title: sanitizeTitle(updates.title as string) } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    ...(updates.status !== undefined ? { status: canonicalizeStatus(updates.status as string) } : {}),
    ...(updates.priority !== undefined ? { priority: canonicalizePriority(updates.priority as string) } : {}),
    ...(updates.assigneeId !== undefined ? { assigneeId: updates.assigneeId } : {}),
    ...((updates.cycleId !== undefined || teamChanged) ? { cycleId: nextCycleId } : {}),
    ...(updates.parentId !== undefined ? { parentId: updates.parentId } : {}),
    ...(updates.prStatus !== undefined ? { prStatus: canonicalizePrStatus(updates.prStatus as string) } : {}),
    ...(updates.prUrl !== undefined ? { prUrl: updates.prUrl } : {}),
    ...(updates.createdAt !== undefined ? { createdAt: updates.createdAt } : {}),
    ...(isProjectMove ? { projectId: targetProject.id } : {}),
    updatedAt: updates.updatedAt ?? new Date(),
  };

  // If the title changed, regenerate the branch name using the existing ticket key.
  if (updates.title !== undefined) {
    const sanitizedTitle = sanitizeTitle(updates.title as string);
    if (existingTicket.key) {
      (payload as any).branchName = generateBranchName(existingTicket.key, sanitizedTitle);
    }
  }

  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .update(tickets)
      .set(payload)
      .where(projectId ? and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)) : eq(tickets.id, ticketId))
      .returning();

    if (rows.length === 0) {
      return null;
    }

    if (updates.labelIds !== undefined || teamChanged) {
      const labelIdsForTicket = nextLabelIds ?? [];
      const teamId = targetProject.teamId;

      if (!teamId && labelIdsForTicket.length > 0) {
        throw new Error('Unable to resolve the ticket team for label assignment.');
      }

      const resolvedLabels = labelIdsForTicket.length > 0
        ? await tx
            .select({
              id: labels.id,
              teamId: labels.teamId,
              name: labels.name,
              color: labels.color,
              description: labels.description,
              sortOrder: labels.sortOrder,
            })
            .from(labels)
            .where(and(eq(labels.teamId, teamId ?? ''), inArray(labels.id, labelIdsForTicket)))
        : [];

      if (teamId && labelIdsForTicket.length > 0 && resolvedLabels.length !== labelIdsForTicket.length) {
        throw new Error('One or more labels were not found for this team.');
      }

      await tx.delete(ticketLabels).where(eq(ticketLabels.ticketId, ticketId));
      if (resolvedLabels.length > 0) {
        await tx.insert(ticketLabels).values(
          resolvedLabels.map((label) => ({ ticketId, labelId: label.id }))
        );
      }
    }

    const updatedLabels = await tx
      .select({
        id: labels.id,
        teamId: labels.teamId,
        name: labels.name,
        color: labels.color,
        description: labels.description,
        sortOrder: labels.sortOrder,
      })
      .from(ticketLabels)
      .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
      .where(eq(ticketLabels.ticketId, ticketId));

    return { ticket: rows[0], labels: updatedLabels };
  });

  if (!result) {
    return null;
  }

  return mapTicket(result.ticket, result.labels);
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
