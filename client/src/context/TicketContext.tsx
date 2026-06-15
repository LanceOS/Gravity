import { apiClient } from '../utils/apiClient';
import React, { createContext, useContext, useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, CACHE_CONFIGS } from '../utils/queryClient';
import { useMoveTicket } from './useMoveTicket';
import { useTicketRelationActions } from '../hooks/useTicketRelationActions';
import type { TicketWithRelations } from '../modules/tickets/utils/ticketRelations';
import { toast } from '@library';

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
import type { User, Project, Domain, Label, Cycle, Ticket, Comment, CreateProjectInput } from '../types/domain';

interface State {
  tickets: Ticket[];
  projects: Project[];
  labels: Label[];
  cycles: Cycle[];
  users: User[];
  comments: Comment[];
  activeTicket: Ticket | null;
  activeView: 'list' | 'board';
  filters: {
    status: string;
    priority: string;
    projectId: string;
    labelId?: string;
    domainId?: string;
    labels: string[];
    labelMode: 'all' | 'any';
    cycleId: string;
    assigneeId: string;
    search: string;
  };
  currentUser: User | null;
  theme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue';
  loading: boolean;
}

export type TicketFiltersState = State['filters'];

type CreateTicketInput = {
  title: string;
  description: string;
  status: Ticket['status'];
  priority: Ticket['priority'];
  projectId: string;
  labelIds?: string[];
  cycleId: string | null;
  assigneeId: string | null;
  parentId: string | null;
  labelId?: string | null;
  domainId?: string | null;
};

const initialFilters = {
  status: '',
  priority: '',
  projectId: '',
  labelId: '',
  labels: [] as string[],
  labelMode: 'any' as 'all' | 'any',
  cycleId: '',
  assigneeId: '',
  search: '',
};

const CURRENT_USER_STORAGE_KEY = 'gravity_user';

function readStoredUser(): User | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawUser = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    const parsedUser = JSON.parse(rawUser) as Record<string, unknown>;
    if (typeof parsedUser.id !== 'string' || typeof parsedUser.name !== 'string' || typeof parsedUser.email !== 'string') {
      window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      return null;
    }

    return {
      id: parsedUser.id,
      name: parsedUser.name,
      email: parsedUser.email,
      avatar: typeof parsedUser.avatar === 'string' ? parsedUser.avatar : '',
      role: typeof parsedUser.role === 'string' ? parsedUser.role : 'guest_contributor',
      tutorial_completed:
        typeof parsedUser.tutorial_completed === 'number' || typeof parsedUser.tutorial_completed === 'boolean'
          ? parsedUser.tutorial_completed
          : undefined,
    };
  } catch {
    window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    return null;
  }
}

// Normalize incoming ticket status values to the canonical app values.
function canonicalizeStatus(status: string | undefined | null): Ticket['status'] {
  if (!status || typeof status !== 'string') return 'todo';
  const lower = status.toLowerCase().trim();
  const normalized = lower.replace(/[^a-z0-9]+/g, '_');
  const allowed = new Set(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']);
  if (allowed.has(normalized)) return normalized as Ticket['status'];

  const collapsed = normalized.replace(/_/g, '');
  if (collapsed === 'inprogress' || collapsed === 'in_progress') return 'in_progress';
  if (collapsed === 'inreview' || collapsed === 'in_review') return 'in_review';
  if (collapsed === 'cancelled' || collapsed === 'canceled') return 'canceled';
  if (collapsed === 'backlog') return 'backlog';
  if (collapsed === 'done') return 'done';
  if (collapsed === 'todo' || collapsed === 'to_do') return 'todo';

  return 'todo';
}

function hasEquivalentTicketFields(left: Ticket, right: Ticket) {
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
    left.prStatus === right.prStatus &&
    left.prUrl === right.prUrl &&
    left.branchName === right.branchName &&
    left.updatedAt === right.updatedAt
  );
}


const TICKET_UPDATE_DEBOUNCE_MS = 250;

type TicketUpdateBatch = {
  originalTickets: Ticket[];
  projectId: string;
  updates: Partial<Ticket>;
  timerId: number | null;
  flushRequested: boolean;
};

type InFlightTicketUpdateBatch = {
  originalTickets: Ticket[];
  projectId: string;
  updates: Partial<Ticket>;
};

const API_URL = '/api/v1';
const AUTH_API_URL = '/api/auth';

interface TicketContextType extends State {
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  fetchInitialData: (userId?: string) => Promise<void>;
  fetchProjectData: (projId: string) => Promise<void>;
  createLabel: (label: { name: string; color?: string; description?: string; projectId?: string; sortOrder?: number }) => Promise<Label | null>;
  updateLabel: (id: string, updates: Partial<Label>) => Promise<Label | null>;
  deleteLabel: (id: string) => Promise<boolean>;
  assignLabelToTicket: (ticketId: string, labelId: string) => Promise<boolean>;
  unassignLabelFromTicket: (ticketId: string, labelId: string) => Promise<boolean>;
  createTicket: (ticket: CreateTicketInput) => Promise<Ticket | null>;
  updateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
  deleteTicket: (id: string) => Promise<void>;
  moveTicket: (id: string, sourceProjectId: string, targetProjectId: string) => Promise<boolean>;
  addComment: (ticketId: string, body: string) => Promise<void>;
  updateComment: (ticketId: string, commentId: string, body: string) => Promise<void>;
  deleteComment: (ticketId: string, commentId: string) => Promise<void>;
  createProject: (project: CreateProjectInput) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<void>;
  joinProject: (inviteCode: string) => Promise<Project | null>;
  signIn: (email: string, password?: string) => Promise<boolean>;
  signUp: (name: string, email: string, password?: string) => Promise<boolean>;
  signOut: () => void;
  setCurrentUser: (user: User | null) => void;
  setTheme: (theme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue') => void;
  setActiveTicket: (ticket: Ticket | null) => void;
  activeTicketDetail: TicketWithRelations | null;
  addTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  removeTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  addTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  removeTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  setView: (view: 'list' | 'board') => void;
  setFilters: (filters: Partial<State['filters']>) => void;
  resetFilters: () => void;
  ticketMap: Map<string, Ticket>;
}

export const TicketContext = createContext<TicketContextType | undefined>(undefined);

export const TicketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  // --- Local UI States ---
  const [activeProjectId, setActiveProjectIdState] = useState<string>('');
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [activeView, setView] = useState<'list' | 'board'>('board');
  const [filters, setFiltersState] = useState<State['filters']>(initialFilters);
  const [currentUser, setCurrentUser] = useState<User | null>(readStoredUser());
  const [theme, setThemeState] = useState<'dark' | 'coal-black' | 'coffee' | 'marble-blue'>('dark');
  const [authLoading, setAuthLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);

  // --- Refs for batching and real-time handlers ---
  const activeProjectIdRef = useRef(activeProjectId);
  const activeTicketRef = useRef(activeTicket);
  const pendingTicketUpdateBatchesRef = useRef(new Map<string, TicketUpdateBatch>());
  const inFlightTicketUpdateBatchesRef = useRef(new Map<string, InFlightTicketUpdateBatch>());

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    activeTicketRef.current = activeTicket;
  }, [activeTicket]);

  useEffect(() => {
    return () => {
      for (const batch of pendingTicketUpdateBatchesRef.current.values()) {
        if (batch.timerId !== null) {
          window.clearTimeout(batch.timerId);
        }
      }
      pendingTicketUpdateBatchesRef.current.clear();
      inFlightTicketUpdateBatchesRef.current.clear();
    };
  }, []);

  // --- Queries ---

  // Projects List
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(currentUser?.id),
    queryFn: () => apiClient.get<Project[]>(`/projects`, { params: { userId: currentUser?.id } }),
    enabled: !!currentUser?.id,
  });
  const projects = projectsQuery.data || [];
  const projectLookup = useMemo(() => {
    const lookup = new Map<string, { workspaceId: string; teamId: string | null }>();
    projects.forEach((project) => {
      lookup.set(project.id, {
        workspaceId: project.workspaceId,
        teamId: project.teamId || null,
      });
    });
    return lookup;
  }, [projects]);

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

  // Users List
  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => apiClient.get<User[]>(`/users`),
    enabled: !!currentUser,
  });
  const users = usersQuery.data || [];

  // Tickets List
  const ticketsQuery = useQuery({
    queryKey: queryKeys.tickets(activeProjectId),
    queryFn: async () => {
      const data = await apiClient.get<Ticket[]>(`/tickets`, { projectId: activeProjectId });
      return data.map((t) => ({ ...t, status: canonicalizeStatus(t.status) }));
    },
    enabled: !!activeProjectId && !!currentUser,
    ...CACHE_CONFIGS.ticketsList,
  });
  const tickets = ticketsQuery.data || [];

  // Labels
  const labelsQuery = useQuery({
    queryKey: queryKeys.labels(activeProjectId),
    queryFn: () => apiClient.get<Label[]>(`/labels`, { projectId: activeProjectId }),
    enabled: !!activeProjectId && !!currentUser,
    ...CACHE_CONFIGS.metadata,
  });
  const labels = labelsQuery.data || [];

  // Cycles
  const cyclesQuery = useQuery({
    queryKey: queryKeys.cycles(activeProjectId),
    queryFn: () => apiClient.get<Cycle[]>(`/cycles`, { projectId: activeProjectId }),
    enabled: !!activeProjectId && !!currentUser,
    ...CACHE_CONFIGS.metadata,
  });
  const cycles = cyclesQuery.data || [];

  // Comments
  const activeTicketId = activeTicket?.id;
  const activeTicketProjectId = activeTicket?.projectId || activeProjectId;
  const commentsQuery = useQuery({
    queryKey: queryKeys.comments(activeTicketId || ''),
    queryFn: () => apiClient.get<Comment[]>(`/tickets/${activeTicketId}/comments`, { projectId: activeTicketProjectId }),
    enabled: !!activeTicketId && !!activeTicketProjectId && !!currentUser,
  });
  const comments = commentsQuery.data || [];

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
  const loading =
    authLoading ||
    projectsQuery.isLoading ||
    usersQuery.isLoading ||
    (!!activeProjectId && ticketsQuery.isLoading) ||
    (!!activeProjectId && labelsQuery.isLoading) ||
    (!!activeProjectId && cyclesQuery.isLoading);

  // Sync activeTicket if it was updated in the tickets query
  useEffect(() => {
    if (activeTicket) {
      const latest = tickets.find(t => t.id === activeTicket.id);
      if (latest && !hasEquivalentTicketFields(latest, activeTicket)) {
        setActiveTicket(latest);
      }
    }
  }, [tickets, activeTicket]);

  // --- Actions ---

  const setActiveProjectId = useCallback((id: string) => {
    setActiveProjectIdState(id);
    setFiltersState(prev => ({ ...prev, projectId: id }));
  }, []);

  const fetchInitialData = useCallback(async (userId?: string) => {
    if (!userId) {
      setActiveProjectIdState('');
      queryClient.clear();
      return;
    }
    await Promise.all([
      queryClient.prefetchQuery({ queryKey: queryKeys.projects(userId), queryFn: () => apiClient.get<Project[]>(`/projects`, { params: { userId } }) }),
      queryClient.prefetchQuery({ queryKey: queryKeys.users(), queryFn: () => apiClient.get<User[]>(`/users`) }),
    ]);
  }, []);

  const fetchProjectData = useCallback(async (projId: string) => {
    if (!projId) return;
    await Promise.all([
      queryClient.prefetchQuery({ queryKey: queryKeys.tickets(projId), queryFn: () => apiClient.get<Ticket[]>(`/tickets`, { projectId: projId }) }),
      queryClient.prefetchQuery({ queryKey: queryKeys.labels(projId), queryFn: () => apiClient.get<Label[]>(`/labels`, { projectId: projId }) }),
      queryClient.prefetchQuery({ queryKey: queryKeys.cycles(projId), queryFn: () => apiClient.get<Cycle[]>(`/cycles`, { projectId: projId }) }),
    ]);
  }, []);

  // --- Auth Session Check ---
  useEffect(() => {
    let cancelled = false;
    const cachedUser = readStoredUser();

    fetch(`${AUTH_API_URL}/session`, { credentials: 'same-origin' })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (cancelled) return;

        if (response.ok && data?.user) {
          setCurrentUser(data.user as User);
          return;
        }

        if (response.status === 401 || response.status === 403) {
          setCurrentUser(null);
          return;
        }

        if (cachedUser) {
          setCurrentUser(cachedUser);
          return;
        }

        setCurrentUser(null);
      })
      .catch((error) => {
        console.error('Failed to restore session:', error);
        if (!cancelled) {
          if (cachedUser) {
            setCurrentUser(cachedUser);
            return;
          }
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthResolved(true);
          setAuthLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
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


  // Sync stored user with local storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentUser) {
      window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(currentUser));
    } else {
      window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    }
  }, [currentUser]);

  // --- Real-time SSE Synchronization ---
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    const eventSource = new EventSource(`${API_URL}/events/subscribe`);

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
    if (message.type === 'tickets-updated') {
          if (message.data.projectId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.tickets(message.data.projectId) });
            invalidateAggregateTicketQueries(message.data.projectId);
          }
        } else if (message.type === 'comments-updated') {
          const activeId = activeTicketRef.current?.id;
          if (activeId && activeId === message.data.ticketId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.comments(message.data.ticketId) });
          }
        } else if (message.type === 'users-updated') {
          queryClient.invalidateQueries({ queryKey: queryKeys.users() });
        }
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [invalidateAggregateTicketQueries]);

  // --- Mutations ---

  // Create Ticket
  const createTicketMutation = useMutation({
    mutationFn: async (ticketInput: CreateTicketInput) => {
      const response = await fetch(`${API_URL}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': ticketInput.projectId,
        },
        body: JSON.stringify(ticketInput),
      });
      if (!response.ok) throw new Error('Failed to create ticket');
      return response.json() as Promise<Ticket>;
    },
    onSuccess: (createdTicket, ticketInput) => {
      if (ticketInput.projectId === activeProjectIdRef.current) {
        queryClient.setQueryData<Ticket[]>(queryKeys.tickets(activeProjectIdRef.current), (old) =>
          old ? [...old, createdTicket] : [createdTicket]
        );
      }
      invalidateAggregateTicketQueries(ticketInput.projectId);
    },
    onSettled: (data, error, ticketInput) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets(ticketInput.projectId) });
      invalidateAggregateTicketQueries(ticketInput.projectId);
    },
  });

  const createTicket = useCallback(async (ticketInput: CreateTicketInput) => {
    try {
      return await createTicketMutation.mutateAsync(ticketInput);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [createTicketMutation]);

  const moveTicket = useMoveTicket({
    queryClient,
    activeProjectIdRef,
    activeTicketRef,
    setActiveProjectIdState,
    setFiltersState,
    setActiveTicket,
    invalidateAggregateTicketQueries,
  });

  // Update Ticket (Debounced)
  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, updates, projectId }: { id: string; updates: Partial<Ticket>; projectId: string }) => {
      const response = await fetch(`${API_URL}/tickets/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': projectId,
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update ticket');
      return response.json();
    },
    onSettled: (data, error, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ticket(data?.key || '') });
      invalidateAggregateTicketQueries(projectId);
    },
  });

  const flushPendingTicketUpdate = useCallback(async (ticketId: string) => {
    const pendingBatch = pendingTicketUpdateBatchesRef.current.get(ticketId);
    if (!pendingBatch) return;

    if (pendingBatch.timerId !== null) {
      window.clearTimeout(pendingBatch.timerId);
      pendingBatch.timerId = null;
    }

    if (inFlightTicketUpdateBatchesRef.current.has(ticketId)) {
      pendingBatch.flushRequested = true;
      return;
    }

    if (Object.keys(pendingBatch.updates).length === 0) {
      pendingTicketUpdateBatchesRef.current.delete(ticketId);
      return;
    }

    pendingTicketUpdateBatchesRef.current.delete(ticketId);
    inFlightTicketUpdateBatchesRef.current.set(ticketId, pendingBatch);

    try {
      await updateTicketMutation.mutateAsync({
        id: ticketId,
        updates: pendingBatch.updates,
        projectId: pendingBatch.projectId,
      });

      inFlightTicketUpdateBatchesRef.current.delete(ticketId);

      const followUpBatch = pendingTicketUpdateBatchesRef.current.get(ticketId);
      if (followUpBatch && followUpBatch.flushRequested) {
        followUpBatch.flushRequested = false;
        void flushPendingTicketUpdate(ticketId);
      }
    } catch (e) {
      console.error('Error updating ticket on server, rolling back:', e);
      inFlightTicketUpdateBatchesRef.current.delete(ticketId);
      
      // Rollback cache
      queryClient.setQueryData(queryKeys.tickets(pendingBatch.projectId), pendingBatch.originalTickets);

      const followUpBatch = pendingTicketUpdateBatchesRef.current.get(ticketId);
      if (followUpBatch) {
        followUpBatch.originalTickets = pendingBatch.originalTickets;
        if (Object.keys(followUpBatch.updates).length > 0) {
          queryClient.setQueryData<Ticket[]>(queryKeys.tickets(pendingBatch.projectId), (old) =>
            old ? old.map((t) => (t.id === ticketId ? { ...t, ...followUpBatch.updates } : t)) : []
          );
        }

        if (followUpBatch.flushRequested) {
          followUpBatch.flushRequested = false;
          void flushPendingTicketUpdate(ticketId);
        }
      }
    }
  }, [updateTicketMutation]);

  const updateTicket = useCallback(async (id: string, updates: Partial<Ticket>) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;

    const pendingBatch = pendingTicketUpdateBatchesRef.current.get(id);
    const ticketsQueryKey = queryKeys.tickets(projectId);
    const currentTickets = queryClient.getQueryData<Ticket[]>(ticketsQueryKey) || [];

    if (!pendingBatch) {
      pendingTicketUpdateBatchesRef.current.set(id, {
        originalTickets: [...currentTickets],
        projectId,
        updates: {},
        timerId: null,
        flushRequested: false,
      });
    }

    // Optimistically update local query cache
    queryClient.setQueryData<Ticket[]>(ticketsQueryKey, (old) =>
      old ? old.map((t) => (t.id === id ? { ...t, ...updates } : t)) : []
    );

    // Also update active ticket if applicable
    if (activeTicketRef.current?.id === id) {
      setActiveTicket((prev) => (prev ? { ...prev, ...updates } : null));
    }

    const nextBatch = pendingTicketUpdateBatchesRef.current.get(id);
    if (!nextBatch) return;

    nextBatch.projectId = projectId;
    nextBatch.updates = { ...nextBatch.updates, ...updates };
    nextBatch.flushRequested = false;

    if (nextBatch.timerId !== null) {
      window.clearTimeout(nextBatch.timerId);
    }

    nextBatch.timerId = window.setTimeout(() => {
      void flushPendingTicketUpdate(id);
    }, TICKET_UPDATE_DEBOUNCE_MS);
  }, [flushPendingTicketUpdate]);

  // Delete Ticket
  const deleteTicketMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${API_URL}/tickets/${id}`, {
        method: 'DELETE',
        headers: { 'X-Project-Id': activeProjectIdRef.current },
      });
    },
    onMutate: async (id) => {
      const projId = activeProjectIdRef.current;
      const queryKey = queryKeys.tickets(projId);
      const previousTickets = queryClient.getQueryData<Ticket[]>(queryKey);

      if (previousTickets) {
        queryClient.setQueryData<Ticket[]>(queryKey, (old) =>
          old ? old.filter((t) => t.id !== id) : []
        );
      }

      if (activeTicketRef.current?.id === id) {
        setActiveTicket(null);
      }

      return { previousTickets };
    },
    onError: (err, id, context: any) => {
      const projId = activeProjectIdRef.current;
      if (context?.previousTickets) {
        queryClient.setQueryData(queryKeys.tickets(projId), context.previousTickets);
      }
    },
    onSettled: () => {
      const projId = activeProjectIdRef.current;
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets(projId) });
      invalidateAggregateTicketQueries(projId);
    },
  });

  const deleteTicket = useCallback(async (id: string) => {
    await deleteTicketMutation.mutateAsync(id);
  }, [deleteTicketMutation]);

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
        const optimisticId = `co-opt-${Date.now()}`;
        const optimisticComment: Comment = {
          id: optimisticId,
          ticketId,
          userId: currentUser.id,
          body,
          createdAt: new Date().toISOString(),
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
    onError: (err, { ticketId }, context: any) => {
      if (context?.previousComments) {
        queryClient.setQueryData(queryKeys.comments(ticketId), context.previousComments);
      }
    },
    onSettled: (data, err, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comments(ticketId) });
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

      if (previousComments) {
        queryClient.setQueryData<Comment[]>(queryKey, (old) =>
          old ? old.map((c) => (c.id === commentId ? { ...c, body } : c)) : []
        );
      }

      return { previousComments };
    },
    onError: (err, { ticketId }, context: any) => {
      if (context?.previousComments) {
        queryClient.setQueryData(queryKeys.comments(ticketId), context.previousComments);
      }
    },
    onSettled: (data, err, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comments(ticketId) });
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
    onError: (err, { ticketId }, context: any) => {
      if (context?.previousComments) {
        queryClient.setQueryData(queryKeys.comments(ticketId), context.previousComments);
      }
    },
    onSettled: (data, err, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comments(ticketId) });
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
    onError: (err, variables, context: any) => {
      if (currentUser && context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects(currentUser.id), context.previousProjects);
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
    onError: (err, id, context: any) => {
      if (currentUser && context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects(currentUser.id), context.previousProjects);
      }
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

  // Create Label
  const createLabelMutation = useMutation({
    mutationFn: async (labelInput: { name: string; color?: string; description?: string; projectId?: string; sortOrder?: number }) => {
      const projectId = labelInput.projectId || activeProjectIdRef.current;
      const existingProjectLabels = labels.filter((label) => label.projectId === projectId || !label.projectId);
      const nextSortOrder =
        labelInput.sortOrder ??
        existingProjectLabels.reduce((maxSortOrder, label) => Math.max(maxSortOrder, Number(label.sortOrder ?? 0)), -1) + 1;

      return apiClient.post<Label>(`/labels`, {
        name: labelInput.name,
        color: labelInput.color || '#6B7280',
        description: labelInput.description || '',
        sortOrder: nextSortOrder,
      }, { projectId });
    },
    onSettled: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels(data?.projectId || activeProjectIdRef.current) });
    },
  });

  const createLabel = useCallback(async (labelInput: any) => {
    try {
      return await createLabelMutation.mutateAsync(labelInput);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [createLabelMutation]);

  // Update Label
  const updateLabelMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Label> }) => {
      return apiClient.put<Label>(`/labels/${id}`, updates);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels(activeProjectIdRef.current) });
      invalidateAggregateTicketQueries(activeProjectIdRef.current);
    },
  });

  const updateLabel = useCallback(async (id: string, updates: Partial<Label>) => {
    try {
      return await updateLabelMutation.mutateAsync({ id, updates });
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [updateLabelMutation]);

  // Delete Label
  const deleteLabelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/labels/${id}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labels(activeProjectIdRef.current) });
      invalidateAggregateTicketQueries(activeProjectIdRef.current);
    },
  });

  const deleteLabel = useCallback(async (id: string) => {
    try {
      await deleteLabelMutation.mutateAsync(id);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [deleteLabelMutation]);

  // Assign Label to Ticket
  const assignLabelMutation = useMutation({
    mutationFn: async ({ ticketId, labelId }: { ticketId: string; labelId: string }) => {
      await apiClient.post(`/tickets/${ticketId}/labels`, { labelId });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets(activeProjectIdRef.current) });
      invalidateAggregateTicketQueries(activeProjectIdRef.current);
    },
  });

  const assignLabelToTicket = useCallback(async (ticketId: string, labelId: string) => {
    try {
      await assignLabelMutation.mutateAsync({ ticketId, labelId });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [assignLabelMutation]);

  // Unassign Label
  const unassignLabelMutation = useMutation({
    mutationFn: async ({ ticketId, labelId }: { ticketId: string; labelId: string }) => {
      await apiClient.delete(`/tickets/${ticketId}/labels/${labelId}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets(activeProjectIdRef.current) });
      invalidateAggregateTicketQueries(activeProjectIdRef.current);
    },
  });

  const unassignLabelFromTicket = useCallback(async (ticketId: string, labelId: string) => {
    try {
      await unassignLabelMutation.mutateAsync({ ticketId, labelId });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [unassignLabelMutation]);

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

  // --- Auth Actions ---
  const signIn = useCallback(async (email: string, password?: string) => {
    try {
      const response = await fetch(`${AUTH_API_URL}/sign-in`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) throw new Error('Sign in failed');
      const data = await response.json();
      setCurrentUser(data.user);
      return true;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password?: string) => {
    try {
      const response = await fetch(`${AUTH_API_URL}/sign-up`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) throw new Error('Registration failed');
      const data = await response.json();
      setCurrentUser(data.user);
      return true;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, []);

  const signOut = useCallback(() => {
    void fetch(`${AUTH_API_URL}/sign-out`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch((error) => {
      console.error('Failed to clear server session:', error);
    });

    setCurrentUser(null);
    setActiveProjectIdState('');
    queryClient.clear();
  }, []);

  const setTheme = useCallback((nextTheme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue') => {
    setThemeState(nextTheme);
  }, []);

  const setFilters = useCallback((nextFilters: Partial<State['filters']>) => {
    setFiltersState(prev => ({ ...prev, ...nextFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({ ...initialFilters, projectId: activeProjectIdRef.current });
  }, []);

  const ticketMap = useMemo(() => new Map(tickets.map(t => [t.key.toUpperCase(), t])), [tickets]);

  const value = useMemo(
    () => ({
      tickets,
      projects,
      labels,
      cycles,
      users,
      comments,
      activeTicket,
      activeTicketDetail,
      activeView,
      filters,
      currentUser,
      theme,
      loading,
      activeProjectId,
      setActiveProjectId,
      fetchInitialData,
      fetchProjectData,
      createLabel,
      updateLabel,
      deleteLabel,
      assignLabelToTicket,
      unassignLabelFromTicket,
      createTicket,
      updateTicket,
      deleteTicket,
      moveTicket,
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
      signIn,
      signUp,
      signOut,
      setCurrentUser,
      setTheme,
      setActiveTicket,
      setView,
      setFilters,
      resetFilters,
      ticketMap,
    }),
    [
      tickets,
      projects,
      labels,
      cycles,
      users,
      comments,
      activeTicket,
      activeTicketDetail,
      activeView,
      filters,
      currentUser,
      theme,
      loading,
      activeProjectId,
      setActiveProjectId,
      fetchInitialData,
      fetchProjectData,
      createLabel,
      updateLabel,
      deleteLabel,
      assignLabelToTicket,
      unassignLabelFromTicket,
      createTicket,
      updateTicket,
      deleteTicket,
      moveTicket,
      addComment,
      updateComment,
      deleteComment,
      addTicketDependency,
      removeTicketDependency,
      createProject,
      updateProject,
      deleteProject,
      joinProject,
      signIn,
      signUp,
      signOut,
      setCurrentUser,
      setTheme,
      setActiveTicket,
      setView,
      setFilters,
      resetFilters,
      addTicketBlocker,
      removeTicketBlocker,
      ticketMap,
    ]
  );

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
};

export const useTickets = () => {
  const context = useContext(TicketContext);
  if (!context) throw new Error('useTickets must be used within a TicketProvider');
  return context;
};
