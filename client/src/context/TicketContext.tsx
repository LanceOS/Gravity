import { apiClient } from '../utils/apiClient';
import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, CACHE_CONFIGS } from '../utils/queryClient';
import { disposeSseService, getSseService } from '../services/sseService';
import { SseEventCoalescer, type SseCoalescedEvent } from '../services/SseEventCoalescer';

import { CommentContext, useCommentContextValue } from './comment/CommentContext';
import { TicketRelationsContext, useTicketRelationsContextValue } from './relation/TicketRelationsContext';
import { ProjectContext, useProjectContextValue } from './project/ProjectContext';
import { resolveWorkspaceIdForSse } from './project/projectCacheUtils';
import { TicketDetailContext, useTicketDetailContextValue } from './ticket/TicketDetailContext';
import type { TicketWithRelations } from '../modules/tickets/utils/ticketRelations';
import {
  combineTicketDetails,
  findCachedTicketByKeyOrId,
  invalidateAggregateTicketQueries,
  getListQueryProjectId,
  normalizeTicketPayload,
  normalizeCommentPayload,
  shouldAcceptSseTicketUpdate,
  shouldAcceptSseCommentUpdate,
  type TicketFiltersState,
} from './shared';
import { authClient } from './auth/authClient';
import { TicketContext } from './TicketContextContext';
import { ActiveTicketContext } from './ticket/ActiveTicketContext';
import { useActiveProject } from './project/ActiveProjectContext';

// Shared entity types live in src/types/domain.ts.
export type {
  User,
  Project,
  Domain,
  Label,
  Cycle,
  Ticket,
  Comment,
  CreateProjectInput,
} from '../types/domain';
import type { User, Project, Label, Cycle, Ticket, Comment, CreateProjectInput } from '../types/domain';

interface State {
  tickets: Ticket[];
  projects: Project[];
  users: User[];
  comments: Comment[];
  activeTicket: Ticket | null;
  currentUser: User | null;
  loading: boolean;
}

// TicketFiltersState is imported from ./shared/filters and re-exported below.
export type { TicketFiltersState };

// ---------------------------------------------------------------------------
// All pure utility functions below have been extracted to context/shared/.
// They are imported at the top of this file and used as-is.
// See: src/context/shared/ticketNormalization.ts
//      src/context/shared/ticketTimestamps.ts
//      src/context/shared/ticketCache.ts
//      src/context/shared/localStorage.ts
//      src/context/shared/filters.ts
// ---------------------------------------------------------------------------

export interface TicketContextType extends State {
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  fetchInitialData: (userId?: string) => Promise<void>;
  fetchProjectData: (projId: string) => Promise<void>;
  addComment: (ticketId: string, body: string) => Promise<void>;
  updateComment: (ticketId: string, commentId: string, body: string) => Promise<void>;
  deleteComment: (ticketId: string, commentId: string) => Promise<void>;
  createProject: (project: CreateProjectInput) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<void>;
  joinProject: (inviteCode: string) => Promise<Project | null>;
  setActiveTicket: React.Dispatch<React.SetStateAction<Ticket | null>>;
  activeTicketDetail: TicketWithRelations | null;
  addTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  removeTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  addTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  removeTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  ticketMap: Map<string, Ticket>;
  ticketById: Map<string, Ticket>;
  projectById: Map<string, Project>;
  projectsByWorkspaceId: Map<string, Project[]>;
  ticketsByProject: Map<string, Ticket[]>;
}

export const TicketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { activeProjectId, setActiveProjectId, activeProjectIdRef } = useActiveProject();
  // --- Local UI States ---
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const { data: session, isPending: authLoading } = authClient.useSession();
  const currentUser: User | null = useMemo(() => {
    return session?.user ? {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      avatar: session.user.image || '',
      role: 'user',
      tutorial_completed: (session.user as any).tutorialCompleted ?? (session.user as any).tutorial_completed ?? false,
    } : null;
  }, [session]);


  // --- Refs for batching and real-time handlers ---

  const activeTicketRef = useRef(activeTicket);
  const currentUserIdRef = useRef<string | undefined>(currentUser?.id);
  const sseCoalescerRef = useRef<SseEventCoalescer | null>(null);

  useEffect(() => {
    activeTicketRef.current = activeTicket;
  }, [activeTicket]);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  // --- Queries ---

  const projectContextValue = useProjectContextValue({
    currentUser,
    setActiveProjectId,
    activeProjectIdRef,
  });
  const projects = projectContextValue.projects;
  const sseWorkspaceId = useMemo(
    () => resolveWorkspaceIdForSse(projects, projectContextValue.projectLookup, activeProjectId),
    [activeProjectId, projectContextValue.projectLookup, projects]
  );

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
      queryClient.removeQueries({ queryKey: queryKeys.ticketDetail(targetTicketId), exact: true });
      queryClient.removeQueries({ queryKey: queryKeys.comments(targetTicketId), exact: true });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.comments(ticketId) });
    }
  }, [queryClient]);

  const upsertTicketFromSse = useCallback((ticket: Ticket | null) => {
    const normalizedTicket = normalizeTicketPayload(ticket);
    if (!normalizedTicket) return;

    const ticketKey = normalizedTicket.key;
    const ticketId = normalizedTicket.id;
    const cachedTicket = findCachedTicketByKeyOrId(queryClient, ticketKey, ticketId);
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

    upsertTicketInListCachesFromSse(normalizedTicket, sourceProjectId);
  }, [queryClient, upsertTicketInListCachesFromSse]);

  const upsertSseComment = useCallback((comment: Comment | null) => {
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
  }, [queryClient]);

  const removeSseComment = useCallback((ticketId?: string, commentId?: string) => {
    if (!ticketId || !commentId) return;

    queryClient.setQueryData<Comment[]>(queryKeys.comments(ticketId), (old) => old ? old.filter((comment) => comment.id !== commentId) : []);
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

  // Users List
  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => apiClient.get<User[]>(`/users`),
    enabled: !!currentUser,
    ...CACHE_CONFIGS.metadata,
  });
  const users = usersQuery.data || [];

  const previousTicketsRef = useRef<Ticket[] | undefined>(undefined);

  // Tickets List
  const ticketsQuery = useQuery({
    queryKey: queryKeys.tickets(activeProjectId),
    queryFn: async () => {
      const data = await apiClient.get<Ticket[]>(`/tickets`, { projectId: activeProjectId });
      return data;
    },
    enabled: !!activeProjectId && !!currentUser,
    ...CACHE_CONFIGS.ticketsList,
  });
  const tickets = ticketsQuery.data ?? previousTicketsRef.current ?? [];

  useEffect(() => {
    if (Array.isArray(ticketsQuery.data)) {
      previousTicketsRef.current = ticketsQuery.data;
    }
  }, [ticketsQuery.data]);

  const ticketDetailContextValue = useTicketDetailContextValue({
    activeTicket,
    setActiveTicket,
    activeProjectId,
    tickets,
    isAuthenticated: !!currentUser,
  });
  const comments = ticketDetailContextValue.comments;

  const commentContextValue = useCommentContextValue({
    currentUser,
    activeProjectIdRef,
  });

  const {
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  } = useTicketRelationsContextValue({
    queryClient,
    tickets,
    activeTicket,
    activeTicketDetail: ticketDetailContextValue.activeTicketDetail,
  });

  const ticketRelationsContextValue = useMemo(() => ({
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  }), [
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  ]);

  // Global loading state combining react-query status
  const loading = authLoading || projectContextValue.projectsLoading || usersQuery.isLoading;

  const ticketMap = useMemo(() => new Map(tickets.map((t) => [t.key.toUpperCase(), t])), [tickets]);
  const ticketById = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);

  // --- Actions ---

  const prevUserIdRef = useRef<string | undefined>(currentUser?.id);
  useEffect(() => {
    if (currentUser?.id !== prevUserIdRef.current) {
      if (prevUserIdRef.current !== undefined && currentUser?.id !== undefined) {
        queryClient.clear();
      }
      prevUserIdRef.current = currentUser?.id;
    }
  }, [currentUser?.id, queryClient]);

  // --- Real-time SSE Synchronization ---
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
            queryClient.invalidateQueries({ queryKey: queryKeys.users() });
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

  // --- Mutations ---
  const {
    addComment,
    updateComment,
    deleteComment,
  } = commentContextValue;

  const {
    fetchInitialData,
    fetchProjectData,
    createProject,
    updateProject,
    deleteProject,
    joinProject,
  } = projectContextValue;

  const projectById = projectContextValue.projectById;
  const projectsByWorkspaceId = projectContextValue.projectsByWorkspaceId;

  const ticketsByProject = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const ticket of tickets) {
      const current = map.get(ticket.projectId);
      if (current) {
        current.push(ticket);
      } else {
        map.set(ticket.projectId, [ticket]);
      }
    }
    return map;
  }, [tickets]);

  const value = useMemo(
    () => ({
      tickets,
      projects,
      users,
      comments,
      activeTicket,
      activeTicketDetail,
      currentUser,
      loading,
      activeProjectId,
      setActiveProjectId,
      fetchInitialData,
      fetchProjectData,
      addComment,
      updateComment,
      deleteComment,
      addTicketDependency,
      removeTicketDependency,
      addTicketBlocker,
      removeTicketBlocker,
      createProject,
      updateProject,
      deleteProject,
      joinProject,
      setActiveTicket,
      ticketMap,
      ticketById,
      projectById,
      projectsByWorkspaceId,
      ticketsByProject,
    }),
    [
      tickets,
      projects,
      users,
      comments,
      activeTicket,
      activeTicketDetail,
      currentUser,
      loading,
      activeProjectId,
      setActiveProjectId,
      fetchInitialData,
      fetchProjectData,
      addComment,
      updateComment,
      deleteComment,
      addTicketDependency,
      removeTicketDependency,
      createProject,
      updateProject,
      deleteProject,
      joinProject,
      setActiveTicket,
      addTicketBlocker,
      removeTicketBlocker,
      ticketMap,
      ticketById,
      projectById,
      projectsByWorkspaceId,
      ticketsByProject,
    ]
  );

  const activeTicketContextValue = useMemo(
    () => ({
      activeTicket,
      setActiveTicket,
    }),
    [activeTicket]
  );

  return (
    <ProjectContext.Provider value={projectContextValue}>
      <ActiveTicketContext.Provider value={activeTicketContextValue}>
        <TicketDetailContext.Provider value={ticketDetailContextValue}>
          <CommentContext.Provider value={commentContextValue}>
            <TicketRelationsContext.Provider value={ticketRelationsContextValue}>
              <TicketContext.Provider value={value}>{children}</TicketContext.Provider>
            </TicketRelationsContext.Provider>
          </CommentContext.Provider>
        </TicketDetailContext.Provider>
      </ActiveTicketContext.Provider>
    </ProjectContext.Provider>
  );
};
