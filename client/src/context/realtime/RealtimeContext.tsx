import { useCallback, useEffect, useMemo, useRef, type FC, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { disposeSseService, getSseService } from '../../services/sseService';
import { SseEventCoalescer, type SseCoalescedEvent } from '../../services/SseEventCoalescer';
import { useAuth } from '../auth/AuthContext';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useProjectContext } from '../project/ProjectContext';
import { useActiveTicket } from '../ticket/ActiveTicketContext';
import { resolveWorkspaceIdForSse } from '../project/projectCacheUtils';
import {
  combineTicketDetails,
  findCachedTicketByKeyOrId,
  getListQueryProjectId,
  invalidateAggregateTicketQueries,
  normalizeCommentPayload,
  normalizeTicketPayload,
  shouldAcceptSseCommentUpdate,
  shouldAcceptSseTicketUpdate,
} from '../shared';
import type { Comment, Ticket } from '../../types/domain';
import type { TicketWithRelations } from '../../modules/tickets/utils/ticketRelations';

export const RealtimeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { activeProjectId } = useActiveProject();
  const { projects, projectLookup } = useProjectContext();
  const { activeTicket } = useActiveTicket();
  const activeTicketRef = useRef(activeTicket);
  const currentUserIdRef = useRef<string | undefined>(currentUser?.id);
  const sseCoalescerRef = useRef<SseEventCoalescer | null>(null);

  const sseWorkspaceId = useMemo(
    () => resolveWorkspaceIdForSse(projects, projectLookup, activeProjectId),
    [activeProjectId, projectLookup, projects]
  );

  useEffect(() => {
    activeTicketRef.current = activeTicket;
  }, [activeTicket]);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  const removeSseTicketEntries = useCallback((ticketKey?: string, ticketId?: string) => {
    const normalizedTicketKey = ticketKey?.toUpperCase();
    const targetTicketId = ticketId?.trim() || undefined;

    for (const [queryKey, value] of queryClient.getQueriesData<Ticket[]>({ queryKey: ['tickets'] })) {
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
      queryClient.removeQueries({ queryKey: ['ticket-detail', targetTicketId], exact: true });
      queryClient.removeQueries({ queryKey: ['comments', { ticketId: targetTicketId }], exact: true });
    }

    if (normalizedTicketKey) {
      for (const [queryKey] of queryClient.getQueriesData({
        queryKey: ['tickets', 'detail', normalizedTicketKey],
      })) {
        queryClient.removeQueries({ queryKey: [...queryKey], exact: true });
      }

      for (const [queryKey] of queryClient.getQueriesData({
        queryKey: ['tickets', 'relations', normalizedTicketKey],
      })) {
        queryClient.removeQueries({ queryKey: [...queryKey], exact: true });
      }
    }
  }, [queryClient]);

  const upsertTicketInListCachesFromSse = useCallback((normalizedTicket: Ticket, sourceProjectIdHint?: string) => {
    const ticketId = normalizedTicket.id;
    const ticketKey = normalizedTicket.key;
    const targetProjectId = normalizedTicket.projectId;

    const listQueries = queryClient.getQueriesData<Ticket[]>({ queryKey: ['tickets'] });
    if (!listQueries.length) {
      return;
    }

    const containingProjects = new Set<string>();
    for (const [queryKey, list] of listQueries) {
      if (!Array.isArray(list)) {
        continue;
      }

      const listProjectId = getListQueryProjectId(queryKey);
      if (!listProjectId) {
        continue;
      }

      if (list.some((ticket) => ticket.id === ticketId || ticket.key === ticketKey)) {
        containingProjects.add(listProjectId);
      }
    }

    const affectedProjectIds = new Set<string>(containingProjects);
    affectedProjectIds.add(targetProjectId);
    if (sourceProjectIdHint) {
      affectedProjectIds.add(sourceProjectIdHint);
    }

    for (const [queryKey, list] of listQueries) {
      const mutableQueryKey = [...queryKey];
      if (!Array.isArray(list)) {
        continue;
      }

      const listProjectId = getListQueryProjectId(queryKey);
      if (!listProjectId || !affectedProjectIds.has(listProjectId)) {
        continue;
      }

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
  }, [queryClient]);

  const invalidateCommentCacheFromSse = useCallback((ticketId?: string) => {
    if (!ticketId) {
      return;
    }

    if (activeTicketRef.current?.id === ticketId) {
      queryClient.invalidateQueries({ queryKey: ['comments', { ticketId }] });
    }
  }, [queryClient]);

  const upsertTicketFromSse = useCallback((ticket: Ticket | null) => {
    const normalizedTicket = normalizeTicketPayload(ticket);
    if (!normalizedTicket) return;

    const ticketKey = normalizedTicket.key;
    const ticketId = normalizedTicket.id;
    const cachedTicket = findCachedTicketByKeyOrId(queryClient, ticketKey, ticketId);
    const sourceProjectId = cachedTicket?.projectId;

    queryClient.setQueryData<TicketWithRelations>(['ticket-detail', ticketId], (existing) => {
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

    upsertTicketInListCachesFromSse(normalizedTicket, sourceProjectId);
  }, [queryClient, upsertTicketInListCachesFromSse]);

  const upsertSseComment = useCallback((comment: Comment | null) => {
    const normalizedComment = normalizeCommentPayload(comment);
    if (!normalizedComment) return;

    queryClient.setQueryData<Comment[]>(['comments', { ticketId: normalizedComment.ticketId }], (old) => {
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
  }, [queryClient]);

  const removeSseComment = useCallback((ticketId?: string, commentId?: string) => {
    if (!ticketId || !commentId) return;

    queryClient.setQueryData<Comment[]>(['comments', { ticketId }], (old) => old ? old.filter((comment) => comment.id !== commentId) : []);
  }, [queryClient]);

  const hydrateAndUpsertTicketFromSse = useCallback(async (ticketId?: string, projectId?: string) => {
    if (!ticketId) {
      return false;
    }

    try {
      const ticket = await apiClient.get<Ticket>(`/tickets/${ticketId}`, projectId ? { projectId } : undefined);
      const normalizedTicket = normalizeTicketPayload(ticket);
      if (!normalizedTicket) {
        return false;
      }

      upsertTicketFromSse(normalizedTicket);
      return true;
    } catch {
      return false;
    }
  }, [upsertTicketFromSse]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    if (!sseWorkspaceId) return;

    const sseService = getSseService(sseWorkspaceId);
    const extractString = (value: unknown): string | undefined => {
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };

    const extractTicketFromEvent = (event: SseCoalescedEvent, messageData: Record<string, unknown>): Ticket | TicketWithRelations | undefined => {
      const payloadTicket = messageData.ticket as Ticket | undefined;
      const directTicket = payloadTicket && typeof payloadTicket === 'object' && payloadTicket.id && payloadTicket.key && payloadTicket.projectId
        ? payloadTicket
        : undefined;

      if (directTicket) {
        return directTicket;
      }

      const payloadTicketId = extractString(messageData.ticketId) || extractString(event.ticketId);
      const cachedById = payloadTicketId ? findCachedTicketByKeyOrId(queryClient, undefined, payloadTicketId) : undefined;
      if (cachedById) {
        return cachedById;
      }

      return event.ticketKey ? findCachedTicketByKeyOrId(queryClient, event.ticketKey, payloadTicketId) : undefined;
    };

    const invalidateProjectMetadata = (projectId?: string) => {
      if (projectId) {
        invalidateAggregateTicketQueries(queryClient, projectId);
      }
    };

    const processSseBatch = (events: SseCoalescedEvent[]) => {
      void (async () => {
        for (const event of events) {
          const eventType = event.type;
          const messageData = event.data && typeof event.data === 'object' && !Array.isArray(event.data)
            ? (event.data as Record<string, unknown>)
            : {};
          const rawTicket = messageData.ticket as Ticket | undefined;
          const payloadTicket = rawTicket && typeof rawTicket === 'object' && rawTicket.id && rawTicket.key && rawTicket.projectId ? rawTicket : null;

          const rawComment = messageData.comment as Comment | undefined;
          const payloadComment = rawComment && typeof rawComment === 'object' && rawComment.id && rawComment.ticketId && rawComment.userId ? rawComment : null;

          const payloadCommentId = extractString(messageData.commentId) || extractString(payloadComment?.id);
          const payloadTicketId = extractString(messageData.ticketId) || extractString(event.ticketId);
          const eventTicketId = payloadTicketId || extractString((payloadComment as Comment | undefined)?.ticketId);
          const cachedTicket = extractTicketFromEvent(event, messageData);
          const projectId = event.projectId || cachedTicket?.projectId;

          if (eventType === 'ticket.updated') {
            if (payloadTicket) {
              upsertTicketFromSse(payloadTicket);
              continue;
            }

            if (cachedTicket) {
              upsertTicketFromSse(cachedTicket as Ticket);
              continue;
            }

            await hydrateAndUpsertTicketFromSse(payloadTicketId || event.ticketId, event.projectId);
            continue;
          }

          if (eventType === 'ticket.created') {
            if (payloadTicket) {
              upsertTicketFromSse(payloadTicket);
              continue;
            }

            if (cachedTicket) {
              upsertTicketFromSse(cachedTicket as Ticket);
              continue;
            }

            await hydrateAndUpsertTicketFromSse(payloadTicketId || event.ticketId, event.projectId);
            continue;
          }

          if (eventType === 'ticket.deleted') {
            if (payloadTicket) {
              removeSseTicketEntries(payloadTicket.key, payloadTicket.id);
              continue;
            }

            if (payloadTicketId) {
              removeSseTicketEntries(undefined, payloadTicketId);
              continue;
            }

            if (!event.ticketKey && !cachedTicket?.id) {
              invalidateProjectMetadata(projectId);
              continue;
            }

            removeSseTicketEntries(event.ticketKey, cachedTicket?.id);
            continue;
          }

          if (eventType === 'comment.added' || eventType === 'comment.updated' || eventType === 'comment.deleted') {
            if (eventType === 'comment.deleted' && payloadCommentId && eventTicketId) {
              removeSseComment(eventTicketId, payloadCommentId);
              continue;
            }

            if (payloadComment && payloadComment.ticketId) {
              upsertSseComment(payloadComment);
              continue;
            }

            if (eventTicketId) {
              invalidateCommentCacheFromSse(eventTicketId);
              continue;
            }

            if (cachedTicket?.id) {
              invalidateCommentCacheFromSse(cachedTicket.id);
              continue;
            }

            if (cachedTicket) {
              upsertTicketFromSse(cachedTicket as Ticket);
              continue;
            }

            await hydrateAndUpsertTicketFromSse(event.ticketId || payloadTicketId, event.projectId);
            continue;
          }

          if (
            eventType === 'labels.added' ||
            eventType === 'labels.removed' ||
            eventType === 'labels.set' ||
            eventType === 'dependency.added' ||
            eventType === 'dependency.removed'
          ) {
            if (cachedTicket) {
              upsertTicketFromSse(cachedTicket as Ticket);
            } else {
              await hydrateAndUpsertTicketFromSse(payloadTicketId, event.projectId);
            }
            continue;
          }

          if (eventType === 'tickets-updated') {
            if (payloadTicket) {
              upsertTicketFromSse(payloadTicket);
              continue;
            }

            if (cachedTicket) {
              upsertTicketFromSse(cachedTicket as Ticket);
            } else {
              await hydrateAndUpsertTicketFromSse(payloadTicketId || event.ticketId, event.projectId);
            }
            continue;
          }

          if (eventType === 'comments-updated') {
            const ticketId = extractString(messageData?.ticketId);
            if (!ticketId) {
              continue;
            }

            invalidateCommentCacheFromSse(ticketId);
            continue;
          }

          if (eventType === 'users-updated') {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            continue;
          }

          if (eventType === 'init') {
            continue;
          }

          if (!projectId) {
            continue;
          }

          invalidateProjectMetadata(projectId);
        }
      })();
    };

    sseCoalescerRef.current?.destroy();
    const coalescer = new SseEventCoalescer(processSseBatch);
    sseCoalescerRef.current = coalescer;

    const handleSseMessage = (event: MessageEvent | Event) => {
      if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
        return;
      }

      try {
        const message = JSON.parse(event.data);
        if (!message || typeof message !== 'object') {
          return;
        }

        const eventType = typeof message.type === 'string' ? message.type : '';
        if (!eventType) {
          return;
        }

        const messageData = message.data && typeof message.data === 'object' && !Array.isArray(message.data)
          ? message.data as Record<string, unknown>
          : {};
        const actorUserId = extractString((message as Record<string, unknown>).actorUserId) || extractString(messageData.actorUserId);
        if (actorUserId && actorUserId === currentUserIdRef.current) {
          return;
        }
        const ticketKey = extractString(message.ticketKey) || extractString(messageData.ticketKey);
        const projectId = extractString(message.projectId) || extractString(messageData.projectId);
        const ticketId = extractString(message.ticketId) || extractString(messageData.ticketId);

        const coalescedEvent: SseCoalescedEvent = {
          type: eventType,
          ticketKey: ticketKey?.toUpperCase(),
          ticketId,
          projectId,
          data: messageData,
        };
        coalescer.enqueue(coalescedEvent);
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    };

    sseService.on('message', handleSseMessage);
    sseService.connect(sseWorkspaceId);

    return () => {
      sseService.off('message', handleSseMessage);
      sseService.disconnect();
      disposeSseService(sseWorkspaceId);
      sseCoalescerRef.current?.destroy();
      sseCoalescerRef.current = null;
    };
  }, [
    sseWorkspaceId,
    invalidateCommentCacheFromSse,
    hydrateAndUpsertTicketFromSse,
    upsertSseComment,
    upsertTicketFromSse,
    removeSseComment,
    removeSseTicketEntries,
  ]);

  return children;
};
