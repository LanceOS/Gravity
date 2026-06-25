import type { Ticket, Comment, Label, Project } from '../../types/domain';
import { mergeTicketRelationSnapshot, type TicketWithRelations } from '../../modules/tickets/utils/ticketRelations';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryClient';

/**
 * Extracts the `projectId` embedded in a React Query list query key.
 * Query keys for ticket lists follow the shape `[tag, { projectId }]`.
 * Returns `undefined` when the key does not match that shape.
 */
export function getListQueryProjectId(queryKey: readonly unknown[]): string | undefined {
  const maybeMeta = queryKey[1];
  if (!maybeMeta || typeof maybeMeta !== 'object' || Array.isArray(maybeMeta)) {
    return undefined;
  }

  const meta = maybeMeta as { projectId?: unknown };
  return typeof meta.projectId === 'string' ? meta.projectId : undefined;
}

function getTicketProjectIdFromCachedTicketData(ticket: unknown): string | undefined {
  if (!ticket || typeof ticket !== 'object' || !('projectId' in ticket)) {
    return undefined;
  }

  const withProject = ticket as { projectId?: unknown };
  return typeof withProject.projectId === 'string' && withProject.projectId.trim()
    ? withProject.projectId
    : undefined;
}

function resolveProjectIdFromTicketCache(
  queryClient: QueryClient,
  ticketId?: string,
  ticketKey?: string,
): string | undefined {
  if (ticketId) {
    const cachedById = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail(ticketId));
    const projectIdFromId = getTicketProjectIdFromCachedTicketData(cachedById);
    if (projectIdFromId) {
      return projectIdFromId;
    }
  }

  if (ticketKey) {
    const normalizedTicketKey = ticketKey.toUpperCase();
    const cachedByKey = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticket(normalizedTicketKey));
    const projectIdFromKey = getTicketProjectIdFromCachedTicketData(cachedByKey);
    if (projectIdFromKey) {
      return projectIdFromKey;
    }

    const cachedRelations = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketRelations(normalizedTicketKey));
    if (cachedRelations && getTicketProjectIdFromCachedTicketData(cachedRelations)) {
      return getTicketProjectIdFromCachedTicketData(cachedRelations);
    }

    const userScopedKeyQueries = queryClient.getQueriesData<TicketWithRelations>({ queryKey: ['tickets', 'detail', normalizedTicketKey] });
    for (const [, cached] of userScopedKeyQueries) {
      const projectIdFromScoped = getTicketProjectIdFromCachedTicketData(cached);
      if (projectIdFromScoped) {
        return projectIdFromScoped;
      }
    }

    const userScopedRelationsQueries = queryClient.getQueriesData<TicketWithRelations>({ queryKey: ['tickets', 'relations', normalizedTicketKey] });
    for (const [, cached] of userScopedRelationsQueries) {
      const projectIdFromScoped = getTicketProjectIdFromCachedTicketData(cached);
      if (projectIdFromScoped) {
        return projectIdFromScoped;
      }
    }
  }

  return undefined;
}

function resolveTicketKeyFromCache(
  queryClient: QueryClient,
  ticketId: string,
  ticketKey?: string,
): string | undefined {
  if (ticketKey) {
    return ticketKey.toUpperCase();
  }

  const cachedById = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail(ticketId));
  if (cachedById?.key) {
    return cachedById.key.toUpperCase();
  }

  return undefined;
}

/**
 * Merges an incoming flat `Ticket` from SSE into the existing cached
 * `TicketWithRelations`, preserving relation data (dependencies, blockers,
 * subtasks) that the flat ticket payload omits.
 *
 * When `existing` is `undefined`, the incoming ticket is cast directly to
 * `TicketWithRelations` so callers receive a consistent return type.
 */
export function combineTicketDetails(
  existing: TicketWithRelations | undefined,
  incoming: Ticket,
): TicketWithRelations {
  if (!existing) {
    return incoming as TicketWithRelations;
  }

  const relationAwareIncoming = {
    ...existing,
    ...incoming,
    dependencies: incoming.dependencies,
    blockers: incoming.blockers,
    blockedTicket: (incoming as TicketWithRelations).blockedTicket,
    relatedTicketIds: (incoming as TicketWithRelations).relatedTicketIds,
  } as TicketWithRelations;

  return mergeTicketRelationSnapshot(existing, relationAwareIncoming);
}

// ---------------------------------------------------------------------------
// Pure candidate-matching predicates used by findCachedTicketByKeyOrId.
// ---------------------------------------------------------------------------

/**
 * Returns true when `candidate` is a valid ticket-like object whose `key`
 * matches `normalizedKey` (already upper-cased by the caller).
 */
export function candidateMatchesKey(
  candidate: unknown,
  normalizedKey: string,
): candidate is Ticket | TicketWithRelations {
  return (
    !!candidate &&
    typeof candidate === 'object' &&
    'id' in candidate &&
    'key' in candidate &&
    typeof (candidate as { key?: string }).key === 'string' &&
    (candidate as { key: string }).key === normalizedKey
  );
}

/**
 * Returns the first ticket in `list` that matches either `normalizedKey` or
 * `normalizedId`. Intended for scanning flat ticket arrays in the React Query
 * cache.
 */
export function findTicketInList(
  list: Ticket[],
  normalizedKey: string | undefined,
  normalizedId: string | undefined,
): Ticket | undefined {
  return list.find(
    (candidate) =>
      (normalizedKey ? candidate.key === normalizedKey : false) ||
      (normalizedId ? candidate.id === normalizedId : false),
  );
}

export type TicketAggregateProjectMetadata = {
  workspaceId: string;
  teamId: string | null;
};

export function findCachedTicketByKeyOrId(
  queryClient: QueryClient,
  ticketKey?: string,
  ticketId?: string,
  projectId?: string,
): Ticket | TicketWithRelations | undefined {
  const normalizedTicketKey = ticketKey?.toUpperCase();
  const normalizedTicketId = ticketId?.trim();

  if (normalizedTicketId) {
    const byIdDetail = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail(normalizedTicketId));
    if (byIdDetail) {
      return byIdDetail;
    }
  }

  if (normalizedTicketKey) {
    const directByKey = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticket(normalizedTicketKey));
    if (candidateMatchesKey(directByKey, normalizedTicketKey)) {
      return directByKey;
    }

    const directByRelations = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketRelations(normalizedTicketKey));
    if (candidateMatchesKey(directByRelations, normalizedTicketKey)) {
      return directByRelations;
    }

    const byKeyQueries = queryClient.getQueriesData<unknown>({ queryKey: ['tickets', 'detail', normalizedTicketKey] });
    for (const [, candidate] of byKeyQueries) {
      if (candidateMatchesKey(candidate, normalizedTicketKey)) {
        return candidate;
      }
    }

    const byRelationQueries = queryClient.getQueriesData<unknown>({ queryKey: ['tickets', 'relations', normalizedTicketKey] });
    for (const [, candidate] of byRelationQueries) {
      if (candidateMatchesKey(candidate, normalizedTicketKey)) {
        return candidate as TicketWithRelations;
      }
    }
  }

  if (projectId) {
    const projectList = queryClient.getQueryData<Ticket[]>(queryKeys.tickets(projectId));
    if (Array.isArray(projectList)) {
      const match = findTicketInList(projectList, normalizedTicketKey, normalizedTicketId);
      if (match) {
        return match;
      }
    }
  }

  const resolvedProjectId = resolveProjectIdFromTicketCache(queryClient, normalizedTicketId, normalizedTicketKey);
  const listQueries = resolvedProjectId
    ? [[queryKeys.tickets(resolvedProjectId), queryClient.getQueryData<Ticket[]>(queryKeys.tickets(resolvedProjectId))] as const]
    : [];
  for (const [, candidateList] of listQueries) {
    if (!Array.isArray(candidateList)) {
      continue;
    }

    const match = findTicketInList(candidateList, normalizedTicketKey, normalizedTicketId);
    if (match) {
      return match;
    }
  }

  return undefined;
}

export function invalidateAggregateTicketQueries(
  queryClient: QueryClient,
  projectId?: string,
): void {
  if (!projectId) {
    return;
  }

  const projectQueries = queryClient.getQueriesData<Project[]>({ queryKey: ['projects'] });
  let metadata: TicketAggregateProjectMetadata | undefined;

  for (const [, projects] of projectQueries) {
    if (!Array.isArray(projects)) {
      continue;
    }

    const match = projects.find((project) => project.id === projectId);
    if (match) {
      metadata = {
        workspaceId: match.workspaceId || '',
        teamId: match.teamId || null,
      };
      break;
    }
  }

  if (!metadata) {
    queryClient.invalidateQueries({ queryKey: ['workspaceTickets'] });
    queryClient.invalidateQueries({ queryKey: ['teamTickets'] });
    return;
  }

  if (metadata.workspaceId) {
    queryClient.invalidateQueries({ queryKey: ['workspaceTickets', metadata.workspaceId] });
  }

  if (metadata.teamId) {
    queryClient.invalidateQueries({ queryKey: ['teamTickets', metadata.teamId] });
  }
}

/**
 * Returns true when every compared field on `left` and `right` is identical.
 * Used to skip no-op cache writes after an SSE update.
 */
export function hasEquivalentTicketFields(left: Ticket, right: Ticket): boolean {
  return (
    left.id === right.id &&
    left.key === right.key &&
    left.title === right.title &&
    left.description === right.description &&
    left.status === right.status &&
    left.priority === right.priority &&
    left.projectId === right.projectId &&
    left.assigneeId === right.assigneeId &&
    left.cycleId === right.cycleId &&
    left.parentId === right.parentId &&
    left.isBlocked === right.isBlocked &&
    left.isDependency === right.isDependency &&
    left.prStatus === right.prStatus &&
    left.prUrl === right.prUrl &&
    left.branchName === right.branchName &&
    left.updatedAt === right.updatedAt
  );
}

/**
 * Returns a new list with the ticket identified by `ticketId` patched with
 * `updates`. Returns `undefined` when `list` is `undefined`, and a shallow
 * copy of the original list when the ticket is not found or the patch
 * produces no observable change.
 */
export function patchTicketInListById(
  list: readonly Ticket[] | undefined,
  ticketId: string,
  updates: Partial<Ticket>,
): Ticket[] | undefined {
  if (!list) {
    return undefined;
  }

  const index = list.findIndex((ticket) => ticket.id === ticketId);
  if (index === -1) {
    return [...list];
  }

  const existingTicket = list[index];
  const nextTicket: Ticket = {
    ...existingTicket,
    ...updates,
  };

  if (hasEquivalentTicketFields(existingTicket, nextTicket)) {
    return [...list];
  }

  const next = [...list];
  next[index] = nextTicket;
  return next;
}

export function patchTicketLabelAssignment(ticket: Ticket, labelId: string, isAssigned: boolean, label?: Label): Ticket {
  const currentLabelIds = Array.isArray(ticket.labelIds)
    ? ticket.labelIds
    : Array.isArray(ticket.labels)
      ? ticket.labels.map((item) => item.id)
      : [];
  const nextLabelIds = new Set<string>(currentLabelIds.filter((id): id is string => typeof id === 'string'));

  if (isAssigned) {
    nextLabelIds.add(labelId);
  } else {
    nextLabelIds.delete(labelId);
  }

  const nextLabelIdsList = Array.from(nextLabelIds);
  let nextLabels: Label[] = Array.isArray(ticket.labels) ? [...ticket.labels] : [];

  if (Array.isArray(ticket.labels)) {
    if (isAssigned) {
      const hasLabel = ticket.labels.some((item) => item.id === labelId);
      if (!hasLabel && label) {
        nextLabels = [...nextLabels, label];
      }
    } else {
      nextLabels = nextLabels.filter((item) => item.id !== labelId);
    }
  }

  return {
    ...ticket,
    labels: nextLabels,
    labelIds: nextLabelIdsList,
  };
}
export function normalizeTicketPayload(value: unknown): Ticket | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const data = value as Record<string, unknown>;
  const id = typeof data.id === 'string' ? data.id.trim() : '';
  const key = typeof data.key === 'string' ? data.key.trim().toUpperCase() : '';
  const projectId = typeof data.projectId === 'string' ? data.projectId.trim() : '';

  if (!id || !key || !projectId) {
    return null;
  }

  const statusValue = typeof data.status === 'string' ? data.status.toLowerCase() : 'todo';
  const priorityValue = typeof data.priority === 'string' ? data.priority.toLowerCase() : 'no_priority';
  const prStatusValue = typeof data.prStatus === 'string' ? data.prStatus.toLowerCase() : 'none';

  const statusSet = new Set(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']);
  const prioritySet = new Set(['no_priority', 'low', 'medium', 'high', 'urgent']);
  const prStatusSet = new Set(['open', 'merged', 'closed', 'none']);

  return {
    id,
    key,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    status: statusSet.has(statusValue) ? (statusValue as Ticket['status']) : 'todo',
    priority: prioritySet.has(priorityValue) ? (priorityValue as Ticket['priority']) : 'no_priority',
    assigneeId: typeof data.assigneeId === 'string' ? data.assigneeId : null,
    projectId,
    domainId: typeof data.domainId === 'string' ? data.domainId : null,
    cycleId: typeof data.cycleId === 'string' ? data.cycleId : null,
    parentId: typeof data.parentId === 'string' ? data.parentId : null,
    isBlocked: typeof data.isBlocked === 'boolean' ? data.isBlocked : false,
    isDependency: typeof data.isDependency === 'boolean' ? data.isDependency : false,
    prStatus: prStatusSet.has(prStatusValue) ? (prStatusValue as Ticket['prStatus']) : 'none',
    prUrl: typeof data.prUrl === 'string' ? data.prUrl : null,
    branchName: typeof data.branchName === 'string' ? data.branchName : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    labels: Array.isArray((data as { labels?: unknown }).labels)
      ? ((data as { labels: unknown[] }).labels.filter((label) => {
          if (!label || typeof label !== 'object') {
            return false;
          }
          const maybeLabel = label as { id?: unknown; name?: unknown; color?: unknown; sortOrder?: unknown; description?: unknown; teamId?: unknown; projectId?: unknown };
          return typeof maybeLabel.id === 'string' && typeof maybeLabel.name === 'string';
        }) as Label[])
      : undefined,
    labelIds: Array.isArray((data as { labelIds?: unknown }).labelIds)
      ? ((data as { labelIds: unknown[] }).labelIds.filter((id): id is string => typeof id === 'string'))
      : undefined,
    dependencies: Array.isArray((data as { dependencies?: unknown }).dependencies)
      ? ((data as { dependencies: unknown[] }).dependencies as Ticket['dependencies'])
      : undefined,
    blockers: Array.isArray((data as { blockers?: unknown }).blockers)
      ? ((data as { blockers: unknown[] }).blockers as Ticket['blockers'])
      : undefined,
  };
}
export function normalizeCommentPayload(value: unknown): Comment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const data = value as Record<string, unknown>;
  const id = typeof data.id === 'string' ? data.id.trim() : '';
  const ticketId = typeof data.ticketId === 'string' ? data.ticketId.trim() : '';
  const userId = typeof data.userId === 'string' ? data.userId.trim() : '';

  if (!id || !ticketId || !userId) {
    return null;
  }

  const author =
    data.author && typeof data.author === 'object'
      ? (() => {
        const authorData = data.author as Record<string, unknown>;
        const authorId = typeof authorData.id === 'string' ? authorData.id : userId;
        const authorUsername = typeof authorData.username === 'string' ? authorData.username : '';
        const authorAvatar =
          typeof authorData.avatar_url === 'string'
            ? authorData.avatar_url
            : typeof authorData.avatarUrl === 'string'
              ? authorData.avatarUrl
              : undefined;
        const authorRole = typeof authorData.role === 'string' ? authorData.role : undefined;

        return {
          id: authorId,
          username: authorUsername,
          avatar_url: authorAvatar,
          role: authorRole,
        };
      })()
      : undefined;

  return {
    id,
    ticketId,
    userId,
    body: typeof data.body === 'string' ? data.body : '',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === 'string'
      ? data.updatedAt
      : typeof data.createdAt === 'string'
        ? data.createdAt
        : new Date().toISOString(),
    userName: typeof data.userName === 'string' ? data.userName : undefined,
    userAvatar: typeof data.userAvatar === 'string' ? data.userAvatar : undefined,
    author,
  };
}

/**
 * Iterates across all known ticket-related query caches and applies a patch function
 * to any cached representation of the target ticket.
 */
export function patchTicketInAllCaches(
  queryClient: QueryClient,
  ticketId: string,
  patchFn: (ticket: Ticket) => Ticket,
  options?: {
    projectId?: string;
    ticketKey?: string;
  }
) {
  const resolvedProjectId = options?.projectId || resolveProjectIdFromTicketCache(queryClient, ticketId, options?.ticketKey);
  const listQueries = resolvedProjectId
    ? [[queryKeys.tickets(resolvedProjectId), queryClient.getQueryData<Ticket[]>(queryKeys.tickets(resolvedProjectId))] as const]
    : [];

  for (const [queryKey, list] of listQueries) {
    if (!Array.isArray(list)) {
      continue;
    }
    const hasMatch = list.some((ticket) => ticket.id === ticketId);
    if (!hasMatch) {
      continue;
    }

    queryClient.setQueryData<Ticket[]>([...queryKey], (existing) => {
      if (!existing || !Array.isArray(existing)) {
        return existing || list;
      }

      const next = [...existing];
      const matchIndex = next.findIndex((ticket) => ticket.id === ticketId);
      if (matchIndex === -1) {
        return existing;
      }

      next[matchIndex] = patchFn(next[matchIndex]);
      return next;
    });
  }

  queryClient.setQueryData<TicketWithRelations>(queryKeys.ticketDetail(ticketId), (existing) => {
    if (!existing || existing.id !== ticketId) {
      return existing as any;
    }
    return patchFn(existing);
  });

  const resolvedTicketKey = resolveTicketKeyFromCache(queryClient, ticketId, options?.ticketKey);
  const detailByKey = resolvedTicketKey
    ? [['tickets', 'detail', resolvedTicketKey], ['tickets', 'relations', resolvedTicketKey]]
    : [queryKeys.ticketDetail(ticketId) as unknown[]];

  for (const baseKey of detailByKey) {
    for (const [queryKey, existingData] of queryClient.getQueriesData<Ticket>({ queryKey: baseKey })) {
      const existingTicket = existingData && typeof existingData === 'object' && 'id' in existingData ? existingData : undefined;
      if (!existingTicket || existingTicket.id !== ticketId) {
        continue;
      }

      queryClient.setQueryData<Ticket>([...queryKey], (existing) => {
        if (!existing || typeof existing !== 'object' || !(existing as { id?: string }).id) {
          return existing as any;
        }
        return patchFn(existing as Ticket);
      });
    }
  }
}

/**
 * Invalidates all query caches related to a single ticket.
 * If projectId is provided, also invalidates the project ticket list cache.
 */
export function invalidateTicketCaches(
  queryClient: QueryClient,
  ticketId: string,
  projectId?: string,
  ticketKey?: string,
) {
  const cachedById = queryClient.getQueryData<Ticket>(queryKeys.ticketDetail(ticketId));
  const resolvedProjectId = projectId || cachedById?.projectId;
  const resolvedTicketKey = ticketKey?.toUpperCase() || cachedById?.key?.toUpperCase();

  const readTicketFromQueryPayload = (cached: unknown): Ticket | undefined => {
    if (!cached || typeof cached !== 'object' || !('id' in cached)) {
      return undefined;
    }

    const candidate = cached as { id?: unknown; projectId?: unknown; key?: unknown };
    if (typeof candidate.id !== 'string') {
      return undefined;
    }

    return candidate as Ticket;
  };

  if (resolvedProjectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets(resolvedProjectId), exact: true });
  }

  queryClient.invalidateQueries({ queryKey: queryKeys.ticketDetail(ticketId), exact: true });

  if (!resolvedTicketKey) {
    return;
  }

  const invalidateUserScopedQueriesById = (queryPrefix: string[]) => {
    for (const [queryKey, cached] of queryClient.getQueriesData<unknown>({ queryKey: queryPrefix })) {
      const ticket = readTicketFromQueryPayload(cached);
      if (!ticket || ticket.id !== ticketId) {
        continue;
      }

      queryClient.invalidateQueries({ queryKey, exact: true });
    }
  };

  const detailPrefix = ['tickets', 'detail', resolvedTicketKey];
  const relationsPrefix = ['tickets', 'relations', resolvedTicketKey];

  invalidateUserScopedQueriesById(detailPrefix);
  invalidateUserScopedQueriesById(relationsPrefix);
}
