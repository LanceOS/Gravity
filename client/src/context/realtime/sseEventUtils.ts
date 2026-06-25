import type { QueryClient } from '@tanstack/react-query';
import type { Comment, Ticket } from '../../types/domain';
import type { TicketWithRelations } from '../../modules/tickets/utils/ticketRelations';
import {
  combineTicketDetails,
  findCachedTicketByKeyOrId,
  getListQueryProjectId,
  normalizeCommentPayload,
  normalizeTicketPayload,
  shouldAcceptSseCommentUpdate,
  shouldAcceptSseTicketUpdate,
} from '../shared';
import { apiClient } from '../../utils/apiClient';
import { queryKeys } from '../../utils/queryClient';

export { findCachedTicketByKeyOrId };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getTicketProjectIdFromCachedTicket(
  queryClient: QueryClient,
  ticketKey: string,
): string | undefined {
  const normalizedTicketKey = ticketKey.toUpperCase();
  const directQueries: Array<readonly unknown[]> = [
    queryKeys.ticket(normalizedTicketKey),
    queryKeys.ticketRelations(normalizedTicketKey),
  ];
  const directByKeyQueries = queryClient.getQueriesData<{ projectId?: string }>({ queryKey: ['tickets', 'detail', normalizedTicketKey] });
  const directByRelationsQueries = queryClient.getQueriesData<{ projectId?: string }>({ queryKey: ['tickets', 'relations', normalizedTicketKey] });

  const scopedQueries = [
    ...directQueries,
    ...directByKeyQueries.map(([queryKey]) => queryKey as unknown[]),
    ...directByRelationsQueries.map(([queryKey]) => queryKey as unknown[]),
  ];

  for (const candidateKey of scopedQueries) {
    const cachedTicket = queryClient.getQueryData<{ projectId?: string }>(candidateKey);
    const projectId = cachedTicket?.projectId;
    if (typeof projectId === 'string' && projectId.trim()) {
      return projectId;
    }
  }

  return undefined;
}

function getTicketProjectIdFromCachedTicketById(
  queryClient: QueryClient,
  ticketId: string,
): string | undefined {
  const cachedById = queryClient.getQueryData<{ projectId?: string }>(queryKeys.ticketDetail(ticketId));
  const projectIdFromId = cachedById?.projectId;
  if (typeof projectIdFromId === 'string' && projectIdFromId.trim()) {
    return projectIdFromId;
  }

  return undefined;
}

export function removeSseTicketEntries(
  queryClient: QueryClient,
  ticketKey?: string,
  ticketId?: string,
  projectId?: string,
): void {
  const normalizedTicketKey = ticketKey?.toUpperCase();
  const targetTicketId = ticketId?.trim() || undefined;
  const resolvedProjectId = projectId
    || (targetTicketId ? getTicketProjectIdFromCachedTicketById(queryClient, targetTicketId) : undefined)
    || (normalizedTicketKey ? getTicketProjectIdFromCachedTicket(queryClient, normalizedTicketKey) : undefined);

  const listQueries = resolvedProjectId
    ? [[queryKeys.tickets(resolvedProjectId), queryClient.getQueryData<Ticket[]>(queryKeys.tickets(resolvedProjectId))] as const]
    : [];

  for (const [queryKey, value] of listQueries) {
    if (!Array.isArray(value)) {
      continue;
    }

    const nextList = value.filter((ticket) => {
      if (targetTicketId && ticket.id === targetTicketId) return false;
      if (normalizedTicketKey && ticket.key === normalizedTicketKey) return false;
      return true;
    });

    if (nextList.length !== value.length) {
      queryClient.setQueryData<Ticket[]>([...queryKey], nextList);
    }
  }

  if (targetTicketId) {
    queryClient.removeQueries({ queryKey: queryKeys.ticketDetail(targetTicketId), exact: true });
    queryClient.removeQueries({ queryKey: queryKeys.comments(targetTicketId), exact: true });
  }

  if (normalizedTicketKey) {
    const detailQueries = queryClient.getQueriesData<unknown>({ queryKey: ['tickets', 'detail', normalizedTicketKey] });
    const relationQueries = queryClient.getQueriesData<unknown>({ queryKey: ['tickets', 'relations', normalizedTicketKey] });

    for (const [entryQueryKey, detailData] of detailQueries) {
      const detailTicket = detailData && typeof detailData === 'object' && 'key' in detailData ? detailData : undefined;
      if (!detailTicket || !('id' in detailTicket)) {
        continue;
      }

      const detailId = typeof (detailTicket as { id?: unknown }).id === 'string' ? (detailTicket as { id?: string }).id : undefined;
      if (detailId && (!targetTicketId || detailId === targetTicketId)) {
        queryClient.removeQueries({ queryKey: [...entryQueryKey], exact: true });
      }
    }

    for (const [entryQueryKey, relationData] of relationQueries) {
      const relationTicket = relationData && typeof relationData === 'object' && 'key' in relationData ? relationData : undefined;
      if (!relationTicket || !('id' in relationTicket)) {
        continue;
      }

      const relationId = typeof (relationTicket as { id?: unknown }).id === 'string' ? (relationTicket as { id?: string }).id : undefined;
      if (relationId && (!targetTicketId || relationId === targetTicketId)) {
        queryClient.removeQueries({ queryKey: [...entryQueryKey], exact: true });
      }
    }
  }
}

export function upsertTicketInListCachesFromSse(
  queryClient: QueryClient,
  normalizedTicket: Ticket,
  sourceProjectIdHint?: string,
): void {
  const ticketId = normalizedTicket.id;
  const ticketKey = normalizedTicket.key;
  const targetProjectId = normalizedTicket.projectId;
  const affectedProjectIds = new Set<string>([
    targetProjectId,
    ...(sourceProjectIdHint ? [sourceProjectIdHint] : []),
  ]);

  const listQueries = Array.from(affectedProjectIds).map((projectId) => (
    [queryKeys.tickets(projectId), queryClient.getQueryData<Ticket[]>(queryKeys.tickets(projectId))] as const
  ));
  if (!listQueries.length) {
    return;
  }

  for (const [queryKey, list] of listQueries) {
    if (!Array.isArray(list)) {
      continue;
    }

    const listProjectId = getListQueryProjectId(queryKey);
    if (!listProjectId || !affectedProjectIds.has(listProjectId)) {
      continue;
    }

    const mutableQueryKey = [...queryKey];
    const shouldRemoveFromProject = listProjectId !== targetProjectId;
    const existingIndex = list.findIndex((ticket) => ticket.id === ticketId || ticket.key === ticketKey);
    if (existingIndex === -1) {
      if (!shouldRemoveFromProject) {
        queryClient.setQueryData<Ticket[]>(mutableQueryKey, [...list, normalizedTicket]);
      }
      continue;
    }

    const existingTicket = list[existingIndex];
    if (!shouldAcceptSseTicketUpdate(existingTicket, normalizedTicket)) {
      continue;
    }

    if (shouldRemoveFromProject) {
      const next = list.filter((ticket) => ticket.id !== ticketId && ticket.key !== ticketKey);
      if (next.length !== list.length) {
        queryClient.setQueryData<Ticket[]>(mutableQueryKey, next);
      }
      continue;
    }

    const next = [...list];
    next[existingIndex] = {
      ...existingTicket,
      ...normalizedTicket,
    };
    queryClient.setQueryData<Ticket[]>(mutableQueryKey, next);
  }
}

export function upsertTicketFromSse(
  queryClient: QueryClient,
  ticket: Ticket | TicketWithRelations | null,
): void {
  const normalizedTicket = normalizeTicketPayload(ticket);
  if (!normalizedTicket) return;

  const ticketKey = normalizedTicket.key;
  const ticketId = normalizedTicket.id;
  const cachedTicket = findCachedTicketByKeyOrId(queryClient, ticketKey, ticketId, normalizedTicket.projectId);
  const sourceProjectId = cachedTicket?.projectId;

  queryClient.setQueryData<TicketWithRelations>(queryKeys.ticketDetail(ticketId), (existing) => {
    if (existing && !shouldAcceptSseTicketUpdate(existing, normalizedTicket)) {
      return existing;
    }

    return existing ? combineTicketDetails(existing, normalizedTicket) : (normalizedTicket as TicketWithRelations);
  });

  for (const [queryKey, existingData] of queryClient.getQueriesData<unknown>({
    queryKey: ['tickets', 'detail', ticketKey],
  })) {
    queryClient.setQueryData<Ticket>([...queryKey], (existing) => {
      const candidate = (existing ?? existingData) as Ticket | TicketWithRelations | undefined;
      if (candidate && shouldAcceptSseTicketUpdate(candidate, normalizedTicket)) {
        return combineTicketDetails(candidate as TicketWithRelations, normalizedTicket);
      }

      if (!candidate) {
        return normalizedTicket as TicketWithRelations;
      }

      return candidate;
    });
  }

  for (const [queryKey, existingData] of queryClient.getQueriesData<unknown>({
    queryKey: ['tickets', 'relations', ticketKey],
  })) {
    queryClient.setQueryData<Ticket>([...queryKey], (existing) => {
      const candidate = (existing ?? existingData) as Ticket | TicketWithRelations | undefined;
      if (candidate && shouldAcceptSseTicketUpdate(candidate, normalizedTicket)) {
        return combineTicketDetails(candidate as TicketWithRelations, normalizedTicket);
      }

      if (!candidate) {
        return normalizedTicket as TicketWithRelations;
      }

      return candidate;
    });
  }

  upsertTicketInListCachesFromSse(queryClient, normalizedTicket, sourceProjectId);
}

export function upsertSseComment(
  queryClient: QueryClient,
  comment: Comment | null,
): void {
  const normalizedComment = normalizeCommentPayload(comment);
  if (!normalizedComment) return;

  queryClient.setQueryData<Comment[]>(queryKeys.comments(normalizedComment.ticketId), (old) => {
    const existing = old || [];
    const index = existing.findIndex((cached) => cached.id === normalizedComment.id);
    if (index !== -1) {
      if (!shouldAcceptSseCommentUpdate(existing[index], normalizedComment)) {
        return existing;
      }

      const next = [...existing];
      next[index] = normalizedComment;
      return next;
    }

    return [...existing, normalizedComment];
  });
}

export function removeSseComment(
  queryClient: QueryClient,
  ticketId?: string,
  commentId?: string,
): void {
  if (!ticketId || !commentId) return;

  queryClient.setQueryData<Comment[]>(queryKeys.comments(ticketId), (old) => old ? old.filter((comment) => comment.id !== commentId) : []);
}

export function invalidateCommentCacheFromSse(
  queryClient: QueryClient,
  ticketId?: string,
  activeTicketId?: string | null,
): void {
  if (!ticketId) {
    return;
  }

  if (activeTicketId === ticketId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.comments(ticketId) });
  }
}

export async function hydrateAndUpsertTicketFromSse(
  queryClient: QueryClient,
  ticketId?: string,
  projectId?: string,
): Promise<boolean> {
  if (!ticketId) {
    return false;
  }

  try {
    const ticket = await apiClient.get<Ticket>(`/tickets/${ticketId}`, projectId ? { projectId } : undefined);
    const normalizedTicket = normalizeTicketPayload(ticket);
    if (!normalizedTicket) {
      return false;
    }

    upsertTicketFromSse(queryClient, normalizedTicket);
    return true;
  } catch {
    return false;
  }
}

export function extractSseMessageFields(message: unknown) {
  if (!isRecord(message)) {
    return null;
  }

  const messageData = isRecord(message.data) ? message.data : {};
  const actorUserId = extractString(message.actorUserId) || extractString(messageData.actorUserId);
  const ticketKey = extractString(message.ticketKey) || extractString(messageData.ticketKey);
  const projectId = extractString(message.projectId) || extractString(messageData.projectId);
  const ticketId = extractString(message.ticketId) || extractString(messageData.ticketId);

  return {
    type: typeof message.type === 'string' ? message.type : '',
    actorUserId,
    ticketKey: ticketKey?.toUpperCase(),
    projectId,
    ticketId,
    data: messageData,
  };
}
