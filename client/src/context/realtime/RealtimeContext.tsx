import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { disposeSseService, getSseService } from '../../services/sseService';
import { SseEventCoalescer, type SseCoalescedEvent } from '../../services/SseEventCoalescer';
import { normalizeCommentPayload, normalizeTicketPayload, invalidateAggregateTicketQueries } from '../shared';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useProjectContext } from '../project/ProjectContext';
import { resolveWorkspaceIdForSse } from '../project/projectCacheUtils';
import { useActiveTicket } from '../ticket/ActiveTicketContext';
import { queryKeys } from '../../utils/queryClient';
import {
  extractSseMessageFields,
  findCachedTicketByKeyOrId,
  hydrateAndUpsertTicketFromSse,
  invalidateCommentCacheFromSse,
  removeSseComment,
  removeSseTicketEntries,
  upsertSseComment,
  upsertTicketFromSse,
} from './sseEventUtils';
import type { RealtimeContextType, RealtimeProviderProps, RealtimeContextValueArgs } from './RealtimeContext.types';
import type { Comment, Ticket } from '../../types/domain';

export const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function useRealtimeContext(): RealtimeContextType {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtimeContext must be used within a RealtimeProvider');
  }

  return context;
}

export function useRealtimeContextValue({
  currentUserId,
}: RealtimeContextValueArgs): RealtimeContextType {
  const { activeProjectId } = useActiveProject();
  const { activeTicket } = useActiveTicket();
  const { projects, projectLookup } = useProjectContext();
  const queryClient = useQueryClient();
  const currentUserIdRef = useRef<string | undefined>(currentUserId ?? undefined);
  const activeTicketRef = useRef<Ticket | null>(activeTicket);
  const sseCoalescerRef = useRef<SseEventCoalescer | null>(null);

  const workspaceId = useMemo(
    () => resolveWorkspaceIdForSse(projects, projectLookup, activeProjectId),
    [activeProjectId, projectLookup, projects],
  );

  useEffect(() => {
    currentUserIdRef.current = currentUserId ?? undefined;
  }, [currentUserId]);

  useEffect(() => {
    activeTicketRef.current = activeTicket;
  }, [activeTicket]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      return;
    }

    if (!workspaceId) {
      return;
    }

    const sseService = getSseService(workspaceId);

    const processSseBatch = (events: SseCoalescedEvent[]) => {
      void (async () => {
        for (const event of events) {
          const messageData = event.data && typeof event.data === 'object' && !Array.isArray(event.data)
            ? (event.data as Record<string, unknown>)
            : {};

          const payloadTicket = normalizeTicketPayload(messageData.ticket);
          const payloadComment = normalizeCommentPayload(messageData.comment);
          const payloadTicketId = typeof messageData.ticketId === 'string' && messageData.ticketId.trim()
            ? messageData.ticketId.trim()
            : typeof event.ticketId === 'string' && event.ticketId.trim()
              ? event.ticketId.trim()
              : undefined;
          const eventTicketId = payloadTicketId || payloadComment?.ticketId || undefined;
          const cachedTicket = findCachedTicketByKeyOrId(queryClient, event.ticketKey, payloadTicketId, event.projectId || payloadTicket?.projectId);
          const projectId = event.projectId || cachedTicket?.projectId || payloadTicket?.projectId;

          switch (event.type) {
            case 'ticket.created':
            case 'ticket.updated':
              if (payloadTicket) {
                upsertTicketFromSse(queryClient, payloadTicket);
                if (projectId) {
                  invalidateAggregateTicketQueries(queryClient, projectId);
                }
                break;
              }

              if (cachedTicket) {
                upsertTicketFromSse(queryClient, cachedTicket as Ticket);
                if (projectId) {
                  invalidateAggregateTicketQueries(queryClient, projectId);
                }
                break;
              }

              await hydrateAndUpsertTicketFromSse(queryClient, payloadTicketId || event.ticketId, projectId);
              if (projectId) {
                invalidateAggregateTicketQueries(queryClient, projectId);
              }
              break;

            case 'ticket.deleted':
              if (payloadTicket) {
                removeSseTicketEntries(queryClient, payloadTicket.key, payloadTicket.id, event.projectId || payloadTicket?.projectId);
                break;
              }

              if (payloadTicketId) {
                removeSseTicketEntries(queryClient, undefined, payloadTicketId, event.projectId);
                break;
              }

              if (event.ticketKey || cachedTicket?.id) {
                removeSseTicketEntries(queryClient, event.ticketKey, cachedTicket?.id, event.projectId);
                break;
              }

              if (projectId) {
                invalidateAggregateTicketQueries(queryClient, projectId);
              }
              break;

            case 'comment.added':
            case 'comment.updated':
            case 'comment.deleted': {
              const commentId = typeof messageData.commentId === 'string' && messageData.commentId.trim()
                ? messageData.commentId.trim()
                : payloadComment?.id;

              if (event.type === 'comment.deleted') {
                const ticketIdForComment = eventTicketId || cachedTicket?.id;

                if (commentId && ticketIdForComment) {
                  removeSseComment(queryClient, ticketIdForComment, commentId);
                } else if (ticketIdForComment) {
                  invalidateCommentCacheFromSse(queryClient, ticketIdForComment, activeTicketRef.current?.id ?? null);
                }
                break;
              }

              if (payloadComment && payloadComment.ticketId) {
                upsertSseComment(queryClient, payloadComment);
                break;
              }

              if (eventTicketId) {
                invalidateCommentCacheFromSse(queryClient, eventTicketId, activeTicketRef.current?.id ?? null);
                break;
              }

              if (cachedTicket?.id) {
                invalidateCommentCacheFromSse(queryClient, cachedTicket.id, activeTicketRef.current?.id ?? null);
                break;
              }

              await hydrateAndUpsertTicketFromSse(queryClient, payloadTicketId || event.ticketId, projectId);
              break;
            }

            case 'labels.added':
            case 'labels.removed':
            case 'labels.set':
            case 'dependency.added':
            case 'dependency.removed':
              if (payloadTicket) {
                upsertTicketFromSse(queryClient, payloadTicket);
                if (projectId) {
                  invalidateAggregateTicketQueries(queryClient, projectId);
                }
                break;
              }

              if (cachedTicket) {
                upsertTicketFromSse(queryClient, cachedTicket as Ticket);
                if (projectId) {
                  invalidateAggregateTicketQueries(queryClient, projectId);
                }
                break;
              }

              await hydrateAndUpsertTicketFromSse(queryClient, payloadTicketId || event.ticketId, projectId);
              if (projectId) {
                invalidateAggregateTicketQueries(queryClient, projectId);
              }
              break;

            case 'tickets-updated':
              if (payloadTicket) {
                upsertTicketFromSse(queryClient, payloadTicket);
                if (projectId) {
                  invalidateAggregateTicketQueries(queryClient, projectId);
                }
                break;
              }

              if (cachedTicket) {
                upsertTicketFromSse(queryClient, cachedTicket as Ticket);
                if (projectId) {
                  invalidateAggregateTicketQueries(queryClient, projectId);
                }
                break;
              }

              await hydrateAndUpsertTicketFromSse(queryClient, payloadTicketId || event.ticketId, projectId);
              if (projectId) {
                invalidateAggregateTicketQueries(queryClient, projectId);
              }
              break;

            case 'comments-updated': {
              const ticketId = typeof messageData.ticketId === 'string' && messageData.ticketId.trim()
                ? messageData.ticketId.trim()
                : cachedTicket?.id;

              if (ticketId) {
                invalidateCommentCacheFromSse(queryClient, ticketId, activeTicketRef.current?.id ?? null);
              }
              break;
            }

            case 'users-updated':
              queryClient.invalidateQueries({ queryKey: queryKeys.users() });
              break;
            case 'init':
              break;

            default:
              if (projectId) {
                invalidateAggregateTicketQueries(queryClient, projectId);
              }
              break;
          }
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
        const parsed = extractSseMessageFields(message);
        if (!parsed || !parsed.type) {
          return;
        }

        if (parsed.actorUserId && parsed.actorUserId === currentUserIdRef.current) {
          return;
        }

        coalescer.enqueue({
          type: parsed.type,
          ticketKey: parsed.ticketKey,
          ticketId: parsed.ticketId,
          projectId: parsed.projectId,
          data: parsed.data,
        });
      } catch (error) {
        console.error('Error parsing SSE event:', error);
      }
    };

    sseService.on('message', handleSseMessage);
    sseService.connect(workspaceId);

    return () => {
      sseService.off('message', handleSseMessage);
      sseService.disconnect();
      disposeSseService(workspaceId);
      sseCoalescerRef.current?.destroy();
      sseCoalescerRef.current = null;
    };
  }, [queryClient, workspaceId]);

  return useMemo(() => ({
    workspaceId: workspaceId || null,
  }), [workspaceId]);
}

export function RealtimeProvider({
  currentUserId,
  children,
}: RealtimeProviderProps) {
  const value = useRealtimeContextValue({ currentUserId });

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}
