import { apiClient } from '../utils/apiClient';
import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, CACHE_CONFIGS } from '../utils/queryClient';
import { disposeSseService, getSseService } from '../services/sseService';
import { SseEventCoalescer, type SseCoalescedEvent } from '../services/SseEventCoalescer';

import { useTicketRelationActions } from '../hooks/useTicketRelationActions';
import type { TicketWithRelations } from '../modules/tickets/utils/ticketRelations';
import {
  combineTicketDetails,
  candidateMatchesKey,
  findTicketInList,
  getListQueryProjectId,
  hasEquivalentTicketFields,
  initialFilters,
  patchTicketInListById,
  patchTicketLabelAssignment,
  normalizeTicketPayload,
  normalizeCommentPayload,
  shouldAcceptSseTicketUpdate,
  shouldAcceptSseCommentUpdate,
  type TicketFiltersState,
} from './shared';
import { authClient } from './auth/authClient';
import { toast } from '@library';
import { TicketContext } from './TicketContextContext';
import { useActiveProject } from './project/ActiveProjectContext';
import { useActiveView } from './ui/ActiveViewContext';
import { useTicketFilters } from './filters/TicketFiltersContext';

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

const API_URL = '/api/v1';
const AUTH_API_URL = '/api/auth';

export interface TicketContextType extends State {
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  fetchInitialData: (userId?: string) => Promise<void>;
  fetchProjectData: (projId: string) => Promise<void>;
  findCachedTicketByKeyOrId: (ticketKey?: string, ticketId?: string) => (Ticket | TicketWithRelations) | undefined;
  invalidateAggregateTicketQueries: (projectId?: string) => void;
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
  const setActiveProjectIdState = setActiveProjectId;
  // --- Local UI States ---
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const { setFilters } = useTicketFilters();
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

  useEffect(() => {
    return () => {
    };
  }, []);

  // --- Queries ---

  // Projects List
  const fetchProjects = async () => {
    try {
      return await apiClient.get<Project[]>(`/projects`, { params: { userId: currentUser?.id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load projects';
      if (toast?.show) {
        toast.show(message, 'error');
      }
      throw error;
    }
  };

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(currentUser?.id),
    queryFn: fetchProjects,
    enabled: !!currentUser?.id,
    ...CACHE_CONFIGS.metadata,
  });
  const projects = Array.isArray(projectsQuery.data) ? projectsQuery.data : [];
  const projectLookup = useMemo(() => {
    const lookup = new Map<string, { workspaceId: string; teamId: string | null }>();
    projects.forEach((project) => {
      lookup.set(project.id, {
        workspaceId: project.workspaceId || '',
        teamId: project.teamId || null,
      });
    });
    return lookup;
  }, [projects]);

  const sseWorkspaceId = useMemo(() => {
    if (activeProjectId) {
      const activeWorkspaceId = projectLookup.get(activeProjectId)?.workspaceId;
      if (activeWorkspaceId) {
        return activeWorkspaceId;
      }
    }

    return projects.length > 0 && projects[0]?.workspaceId ? projects[0].workspaceId : '';
  }, [activeProjectId, projectLookup, projects]);

  const invalidateAggregateTicketQueries = useCallback((projectId?: string) => {
    if (!projectId) return;

    const metadata = projectLookup.get(projectId);
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
  }, [projectLookup]);

  const invalidateWorkspaceSidebarQueries = useCallback((projectId?: string | null) => {
    if (projectId) {
      const workspaceId = projectLookup.get(projectId)?.workspaceId;
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSidebarTree(workspaceId), exact: true });
        return;
      }
    }

    for (const [queryKey] of queryClient.getQueriesData({ queryKey: ['workspace'] })) {
      const normalizedQueryKey = [...queryKey];
      if (queryKey[0] === 'workspace' && queryKey[2] === 'sidebar') {
        queryClient.invalidateQueries({ queryKey: normalizedQueryKey, exact: true });
      }
    }
  }, [projectLookup, queryClient]);

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

  const findCachedTicketByKeyOrId = useCallback((ticketKey?: string, ticketId?: string): (Ticket | TicketWithRelations) | undefined => {
    const normalizedTicketKey = ticketKey?.toUpperCase();
    const normalizedTicketId = ticketId?.trim();

    if (normalizedTicketId) {
      const byIdDetail = queryClient.getQueryData<TicketWithRelations>(queryKeys.ticketDetail(normalizedTicketId));
      if (byIdDetail) {
        return byIdDetail;
      }
    }

    if (normalizedTicketKey) {
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

    const listQueries = queryClient.getQueriesData<Ticket[]>({ queryKey: ['tickets'] });
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
    const cachedTicket = findCachedTicketByKeyOrId(ticketKey, ticketId);
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
  }, [queryClient, findCachedTicketByKeyOrId, upsertTicketInListCachesFromSse]);

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
  const previousCommentsRef = useRef<Comment[] | undefined>(undefined);

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

  // Comments
  const activeTicketId = activeTicket?.id;
  const activeTicketProjectId = activeTicket?.projectId || activeProjectId;
  useEffect(() => {
    if (Array.isArray(ticketsQuery.data)) {
      previousTicketsRef.current = ticketsQuery.data;
    }
  }, [ticketsQuery.data]);

  // Comments
  const commentsQuery = useQuery({
    queryKey: queryKeys.comments(activeTicketId || ''),
    queryFn: () => apiClient.get<Comment[]>(`/tickets/${activeTicketId}/comments`, { projectId: activeTicketProjectId }),
    enabled: !!activeTicketId && !!activeTicketProjectId && !!currentUser,
    ...CACHE_CONFIGS.ticketDetail,
  });
  const comments = commentsQuery.data ?? previousCommentsRef.current ?? [];

  useEffect(() => {
    if (Array.isArray(commentsQuery.data)) {
      previousCommentsRef.current = commentsQuery.data;
    }
  }, [commentsQuery.data]);

  const {
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  } = useTicketRelationActions({
    queryClient,
    tickets,
    activeTicket,
    activeTicketId,
    activeTicketProjectId,
    isAuthenticated: !!currentUser,
  });

  // Global loading state combining react-query status
  const loading = authLoading || projectsQuery.isLoading || usersQuery.isLoading;

  const ticketMap = useMemo(() => new Map(tickets.map((t) => [t.key.toUpperCase(), t])), [tickets]);
  const ticketById = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);

  // Sync activeTicket if it was updated in the tickets query
  useEffect(() => {
    if (!activeTicket) {
      return;
    }

    const latest = ticketById.get(activeTicket.id);
    if (latest && !hasEquivalentTicketFields(latest, activeTicket)) {
      setActiveTicket(latest);
    }
  }, [activeTicket, ticketById]);

  // --- Actions ---


  const fetchInitialData = useCallback(async (userId?: string) => {
    if (!userId) {
      setActiveProjectIdState('');
      queryClient.clear();
      return;
    }
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.projects(userId),
        queryFn: () => apiClient.get<Project[]>(`/projects`, { params: { userId } }),
        ...CACHE_CONFIGS.metadata,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.users(),
        queryFn: () => apiClient.get<User[]>(`/users`),
        ...CACHE_CONFIGS.metadata,
      }),
    ]);
  }, []);

  const fetchProjectData = useCallback(async (projId: string) => {
    if (!projId) return;
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.tickets(projId),
        queryFn: async () => {
          const data = await apiClient.get<Ticket[]>(`/tickets`, { projectId: projId });
          return data;
        },
        ...CACHE_CONFIGS.ticketsList,
      }),
    ]);
  }, []);

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
      const cachedById = payloadTicketId ? findCachedTicketByKeyOrId(undefined, payloadTicketId) : undefined;
      if (cachedById) {
        return cachedById;
      }

      return event.ticketKey ? findCachedTicketByKeyOrId(event.ticketKey, payloadTicketId) : undefined;
    };

    const invalidateProjectMetadata = (projectId?: string) => {
      if (projectId) {
        invalidateAggregateTicketQueries(projectId);
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
    invalidateAggregateTicketQueries,
    findCachedTicketByKeyOrId,
    hydrateAndUpsertTicketFromSse,
    upsertSseComment,
    upsertTicketFromSse,
    removeSseComment,
    removeSseTicketEntries,
  ]);

  // --- Mutations ---

  // Add Comment
  const addCommentMutation = useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      if (!currentUser || !activeProjectIdRef.current) throw new Error('Not authenticated');
      const response = await fetch(`${API_URL}/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': activeProjectIdRef.current,
        },
        body: JSON.stringify({ userId: currentUser.id, body }),
      });
      if (!response.ok) throw new Error('Failed to add comment');
      return response.json() as Promise<Comment>;
    },
    onMutate: async ({ ticketId, body }) => {
      const queryKey = queryKeys.comments(ticketId);
      const previousComments = queryClient.getQueryData<Comment[]>(queryKey);

      if (currentUser) {
        const optimisticUpdatedAt = new Date().toISOString();
        const optimisticId = `co-opt-${Date.now()}`;
        const optimisticComment: Comment = {
          id: optimisticId,
          ticketId,
          userId: currentUser.id,
          body,
          createdAt: optimisticUpdatedAt,
          updatedAt: optimisticUpdatedAt,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          author: {
            id: currentUser.id,
            username: currentUser.name,
            avatar_url: currentUser.avatar,
            role: currentUser.role,
          },
        };
        queryClient.setQueryData<Comment[]>(queryKey, (old) =>
          old ? [...old, optimisticComment] : [optimisticComment]
        );
      }

      return { previousComments };
    },
    onError: (_err: unknown, { ticketId }: { ticketId: string }, context: { previousComments?: Comment[] } | undefined) => {
      if (context?.previousComments) {
        queryClient.setQueryData(queryKeys.comments(ticketId), context.previousComments);
      }
    },
  });

  const addComment = useCallback(async (ticketId: string, body: string) => {
    await addCommentMutation.mutateAsync({ ticketId, body });
  }, [addCommentMutation]);

  // Update Comment
  const updateCommentMutation = useMutation({
    mutationFn: async ({ ticketId, commentId, body }: { ticketId: string; commentId: string; body: string }) => {
      await apiClient.patch(`/tickets/${ticketId}/comments/${commentId}`, { body }, { projectId: activeProjectIdRef.current });
    },
    onMutate: async ({ ticketId, commentId, body }) => {
      const queryKey = queryKeys.comments(ticketId);
      const previousComments = queryClient.getQueryData<Comment[]>(queryKey);
      const optimisticUpdatedAt = new Date().toISOString();

      if (previousComments) {
        queryClient.setQueryData<Comment[]>(queryKey, (old) =>
          old ? old.map((c) => (c.id === commentId ? { ...c, body, updatedAt: optimisticUpdatedAt } : c)) : []
        );
      }

      return { previousComments };
    },
    onError: (_err: unknown, { ticketId }: { ticketId: string }, context: { previousComments?: Comment[] } | undefined) => {
      if (context?.previousComments) {
        queryClient.setQueryData(queryKeys.comments(ticketId), context.previousComments);
      }
    },
  });

  const updateComment = useCallback(async (ticketId: string, commentId: string, body: string) => {
    await updateCommentMutation.mutateAsync({ ticketId, commentId, body });
  }, [updateCommentMutation]);

  // Delete Comment
  const deleteCommentMutation = useMutation({
    mutationFn: async ({ ticketId, commentId }: { ticketId: string; commentId: string }) => {
      await apiClient.delete(`/tickets/${ticketId}/comments/${commentId}`, { projectId: activeProjectIdRef.current });
    },
    onMutate: async ({ ticketId, commentId }) => {
      const queryKey = queryKeys.comments(ticketId);
      const previousComments = queryClient.getQueryData<Comment[]>(queryKey);

      if (previousComments) {
        queryClient.setQueryData<Comment[]>(queryKey, (old) =>
          old ? old.filter((c) => c.id !== commentId) : []
        );
      }

      return { previousComments };
    },
    onError: (_err: unknown, { ticketId }: { ticketId: string }, context: { previousComments?: Comment[] } | undefined) => {
      if (context?.previousComments) {
        queryClient.setQueryData(queryKeys.comments(ticketId), context.previousComments);
      }
    },
  });

  const deleteComment = useCallback(async (ticketId: string, commentId: string) => {
    await deleteCommentMutation.mutateAsync({ ticketId, commentId });
  }, [deleteCommentMutation]);

  // Create Project
  const createProjectMutation = useMutation({
    mutationFn: async (projectInput: CreateProjectInput) => {
      if (!currentUser) throw new Error('Not signed in');
      return apiClient.post<Project>(`/projects`, {
        ...projectInput,
        ownerId: currentUser.id,
        status: projectInput.status || 'active',
      });
    },
    onSuccess: (project) => {
      if (currentUser) {
        queryClient.setQueryData<Project[]>(queryKeys.projects(currentUser.id), (old) => {
          return old ? [...old, project] : [project];
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentUser.id) });
        invalidateWorkspaceSidebarQueries(project.id);
        setActiveProjectId(project.id);
      }
    },
  });

  const createProject = useCallback(async (projectInput: CreateProjectInput) => {
    try {
      return await createProjectMutation.mutateAsync(projectInput);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [createProjectMutation]);

  // Update Project
  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Project> }) => {
      return apiClient.patch<Project>(`/projects/${id}`, updates);
    },
    onMutate: async ({ id, updates }) => {
      if (!currentUser) return;
      const queryKey = queryKeys.projects(currentUser.id);
      const previousProjects = queryClient.getQueryData<Project[]>(queryKey);

      if (previousProjects) {
        queryClient.setQueryData<Project[]>(queryKey, (old) =>
          old ? old.map((p) => (p.id === id ? { ...p, ...updates } : p)) : []
        );
      }

      return { previousProjects };
    },
    onError: (_err: unknown, _variables: { id: string; updates: Partial<Project> }, context: { previousProjects?: Project[] } | undefined) => {
      if (currentUser && context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects(currentUser.id), context.previousProjects);
      }
    },
    onSuccess: (project) => {
      if (project) {
        invalidateWorkspaceSidebarQueries(project.id);
      }
    },
    onSettled: () => {
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentUser.id) });
      }
    },
  });

  const updateProject = useCallback(async (id: string, updates: Partial<Project>) => {
    try {
      return await updateProjectMutation.mutateAsync({ id, updates });
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [updateProjectMutation]);

  // Delete Project
  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/projects/${id}`);
    },
    onMutate: async (id) => {
      if (!currentUser) return;
      const queryKey = queryKeys.projects(currentUser.id);
      const previousProjects = queryClient.getQueryData<Project[]>(queryKey);

      if (previousProjects) {
        queryClient.setQueryData<Project[]>(queryKey, (old) =>
          old ? old.filter((p) => p.id !== id) : []
        );
      }

      if (activeProjectIdRef.current === id) {
        setActiveProjectId('');
      }

      return { previousProjects };
    },
    onError: (_err: unknown, _id: string, context: { previousProjects?: Project[] } | undefined) => {
      if (currentUser && context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects(currentUser.id), context.previousProjects);
      }
    },
    onSuccess: (_, id) => {
      invalidateWorkspaceSidebarQueries(id);
    },
    onSettled: () => {
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentUser.id) });
      }
    },
  });

  const deleteProject = useCallback(async (id: string) => {
    try {
      await deleteProjectMutation.mutateAsync(id);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [deleteProjectMutation]);

  // Join Project
  const joinProjectMutation = useMutation({
    mutationFn: async (inviteCode: string) => {
      if (!currentUser) throw new Error('Not signed in');
      const data = await apiClient.post<{ project: Project }>(`/projects/invite/accept`, { inviteCode, userId: currentUser.id });
      return data.project;
    },
    onSuccess: (project) => {
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentUser.id) });
        invalidateWorkspaceSidebarQueries(project.id);
        setActiveProjectId(project.id);
      }
    },
  });

  const joinProject = useCallback(async (inviteCode: string) => {
    try {
      return await joinProjectMutation.mutateAsync(inviteCode);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [joinProjectMutation]);

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const project of projects) {
      map.set(project.id, project);
    }
    return map;
  }, [projects]);

  const projectsByWorkspaceId = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const project of projects) {
      const workspaceId = project.workspaceId || '';
      const current = map.get(workspaceId);
      if (current) {
        current.push(project);
      } else {
        map.set(workspaceId, [project]);
      }
    }
    return map;
  }, [projects]);

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
      findCachedTicketByKeyOrId,
      invalidateAggregateTicketQueries,
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
      findCachedTicketByKeyOrId,
      invalidateAggregateTicketQueries,
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

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
};
