import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';

// Domain entity types live in src/types/domain.ts.
// They are re-exported here for backwards compatibility — all existing import
// sites pointing to this file continue to work without any changes.
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
  domainId?: string | null;
};

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'CLEAR_WORKSPACE_DATA' }
  | { type: 'CLEAR_PROJECT_DATA' }
  | {
    type: 'SET_INITIAL_DATA';
    payload: {
      tickets: Ticket[];
      projects: Project[];
      labels: Label[];
      cycles: Cycle[];
      users: User[];
    };
  }
  | { type: 'SET_PROJECT_DATA'; payload: { tickets: Ticket[]; labels: Label[]; cycles: Cycle[] } }
  | { type: 'SET_TICKETS_RAW'; payload: Ticket[] }
  | { type: 'SET_COMMENTS_RAW'; payload: Comment[] }
  | { type: 'SET_ACTIVE_TICKET'; payload: Ticket | null }
  | { type: 'SET_VIEW'; payload: 'list' | 'board' }
  | { type: 'SET_FILTERS'; payload: Partial<State['filters']> }
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_THEME_RAW'; payload: 'dark' | 'coal-black' | 'coffee' | 'marble-blue' }
  | { type: 'ADD_COMMENT'; payload: Comment }
  | { type: 'REPLACE_COMMENT'; payload: { optimisticId: string; comment: Comment } }
  | { type: 'OPTIMISTIC_TICKET_UPDATE'; payload: { id: string; updates: Partial<Ticket> } }
  | { type: 'UPDATE_COMMENT_RAW'; payload: { commentId: string; body: string } }
  | { type: 'DELETE_COMMENT_RAW'; payload: { commentId: string } };

const initialFilters = {
  status: '',
  priority: '',
  projectId: '',
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

function createInitialState(): State {
  return {
    tickets: [],
    projects: [],
    labels: [],
    cycles: [],
    users: [],
    comments: [],
    activeTicket: null,
    activeView: 'board',
    filters: initialFilters,
    currentUser: readStoredUser(),
    theme: 'dark',
    loading: true,
  };
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

  // Fallback to todo for any unrecognized value
  return 'todo';
}


function upsertTicket(existingTickets: Ticket[], nextTicket: Ticket) {
  const ticketIndex = existingTickets.findIndex((ticket) => ticket.id === nextTicket.id);
  if (ticketIndex === -1) {
    return [...existingTickets, nextTicket];
  }

  return existingTickets.map((ticket, index) => (index === ticketIndex ? nextTicket : ticket));
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
// API Base URL
const API_URL = '/api/v1';
const AUTH_API_URL = '/api/auth';

function ticketReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'CLEAR_WORKSPACE_DATA':
      return {
        ...state,
        tickets: [],
        projects: [],
        labels: [],
        cycles: [],
        users: [],
        comments: [],
        activeTicket: null,
        filters: initialFilters,
      };
    case 'CLEAR_PROJECT_DATA':
      return {
        ...state,
        tickets: [],
        labels: [],
        cycles: [],
        comments: [],
        activeTicket: null,
      };
    case 'SET_INITIAL_DATA':
      return {
        ...state,
        ...action.payload,
        loading: false,
      };
    case 'SET_PROJECT_DATA':
      return {
        ...state,
        tickets: action.payload.tickets.map((t) => ({ ...t, status: canonicalizeStatus(t.status) })),
        labels: action.payload.labels,
        cycles: action.payload.cycles,
      };
    case 'SET_TICKETS_RAW': {
      let nextActive = state.activeTicket;
      if (nextActive) {
        const found = action.payload.find(t => t.id === nextActive!.id);
        if (found) nextActive = found;
      }
      return { ...state, tickets: action.payload.map((t) => ({ ...t, status: canonicalizeStatus(t.status) })), activeTicket: nextActive };
    }
    case 'SET_COMMENTS_RAW':
      return { ...state, comments: action.payload };
    case 'SET_ACTIVE_TICKET':
      return { ...state, activeTicket: action.payload };
    case 'SET_VIEW':
      return { ...state, activeView: action.payload };
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } };
    case 'SET_USER':
      return { ...state, currentUser: action.payload };
    case 'SET_THEME_RAW':
      return { ...state, theme: action.payload };
    case 'ADD_COMMENT':
      return { ...state, comments: [...state.comments, action.payload] };
    case 'REPLACE_COMMENT': {
      let hasSavedComment = false;
      const nextComments: Comment[] = [];

      for (const comment of state.comments) {
        if (comment.id === action.payload.optimisticId || comment.id === action.payload.comment.id) {
          if (!hasSavedComment) {
            nextComments.push(action.payload.comment);
            hasSavedComment = true;
          }

          continue;
        }

        nextComments.push(comment);
      }

      return {
        ...state,
        comments: hasSavedComment ? nextComments : [...nextComments, action.payload.comment],
      };
    }
    case 'OPTIMISTIC_TICKET_UPDATE': {
      const updatedTickets = state.tickets.map(ticket => {
        if (ticket.id === action.payload.id) {
          return { ...ticket, ...action.payload.updates };
        }
        return ticket;
      });

      let nextActive = state.activeTicket;
      if (nextActive && nextActive.id === action.payload.id) {
        nextActive = { ...nextActive, ...action.payload.updates };
      }

      return {
        ...state,
        tickets: updatedTickets,
        activeTicket: nextActive,
      };
    }
    case 'UPDATE_COMMENT_RAW':
      return {
        ...state,
        comments: state.comments.map(c => c.id === action.payload.commentId ? { ...c, body: action.payload.body } : c),
      };
    case 'DELETE_COMMENT_RAW':
      return {
        ...state,
        comments: state.comments.filter(c => c.id !== action.payload.commentId),
      };
    default:
      return state;
  }
}

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
  addComment: (ticketId: string, body: string) => Promise<void>;
  updateComment: (ticketId: string, commentId: string, body: string) => Promise<void>;
  deleteComment: (ticketId: string, commentId: string) => Promise<void>;
  createProject: (project: CreateProjectInput) => Promise<Project | null>;
  joinProject: (inviteCode: string) => Promise<Project | null>;
  signIn: (email: string, password?: string) => Promise<boolean>;
  signUp: (name: string, email: string, password?: string) => Promise<boolean>;
  signOut: () => void;
  setCurrentUser: (user: User | null) => void;
  setTheme: (theme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue') => void;
  setActiveTicket: (ticket: Ticket | null) => void;
  setView: (view: 'list' | 'board') => void;
  setFilters: (filters: Partial<State['filters']>) => void;
  resetFilters: () => void;
  ticketMap: Map<string, Ticket>;
}

export const TicketContext = createContext<TicketContextType | undefined>(undefined);

export const TicketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(ticketReducer, undefined, createInitialState);
  const [activeProjectId, setActiveProjectIdState] = React.useState<string>('');
  const [authResolved, setAuthResolved] = React.useState(false);
  const stateRef = React.useRef(state);
  const activeProjectIdRef = React.useRef(activeProjectId);
  const pendingTicketUpdateBatchesRef = React.useRef(new Map<string, TicketUpdateBatch>());
  const inFlightTicketUpdateBatchesRef = React.useRef(new Map<string, InFlightTicketUpdateBatch>());
  const loadedUserIdRef = React.useRef<string | null>(null);
  const loadedProjectIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

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

  const setActiveProjectId = useCallback((id: string) => {
    setActiveProjectIdState(id);
    // Sync filters projectId
    dispatch({ type: 'SET_FILTERS', payload: { projectId: id } });
  }, []);

  const clearWorkspaceData = useCallback(() => {
    loadedUserIdRef.current = null;
    loadedProjectIdRef.current = null;
    setActiveProjectIdState('');
    dispatch({ type: 'CLEAR_WORKSPACE_DATA' });
  }, []);

  const clearProjectData = useCallback(() => {
    loadedProjectIdRef.current = null;
    dispatch({ type: 'CLEAR_PROJECT_DATA' });
  }, []);

  // 1. Fetch initial central data (projects, users)
  const fetchInitialData = useCallback(async (userId?: string) => {
    if (!userId) {
      clearWorkspaceData();
      return;
    }

    const isUserTransition = loadedUserIdRef.current !== null && loadedUserIdRef.current !== userId;
    if (isUserTransition) {
      clearWorkspaceData();
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const [projectsRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/projects?userId=${encodeURIComponent(userId)}`),
        fetch(`${API_URL}/users`),
      ]);

      const [projects, users] = await Promise.all([
        handleArrayResponse<Project>(projectsRes, 'Failed to load projects'),
        handleArrayResponse<User>(usersRes, 'Failed to load users'),
      ]);

      dispatch({
        type: 'SET_INITIAL_DATA',
        payload: { tickets: [], projects, labels: [], cycles: [], users },
      });
      loadedUserIdRef.current = userId;
    } catch (error) {
      console.error('Failed to load initial workspace data:', error);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [clearWorkspaceData]);

  // Fetch project-specific data (tickets, labels, cycles)
  const fetchProjectData = useCallback(async (projId: string) => {
    if (!projId) return;

    const isProjectTransition = loadedProjectIdRef.current !== null && loadedProjectIdRef.current !== projId;
    if (isProjectTransition) {
      clearProjectData();
    }

    try {
      const [ticketsRes, labelsRes, cyclesRes] = await Promise.all([
        fetch(`${API_URL}/tickets`, { headers: { 'X-Project-Id': projId } }),
        fetch(`${API_URL}/labels`, { headers: { 'X-Project-Id': projId } }),
        fetch(`${API_URL}/cycles`, { headers: { 'X-Project-Id': projId } }),
      ]);

      const [tickets, labels, cycles] = await Promise.all([
        handleArrayResponse<Ticket>(ticketsRes, `Failed to load tickets for project ${projId}`),
        handleArrayResponse<Label>(labelsRes, `Failed to load labels for project ${projId}`),
        handleArrayResponse<Cycle>(cyclesRes, `Failed to load cycles for project ${projId}`),
      ]);

      dispatch({
        type: 'SET_PROJECT_DATA',
        payload: { tickets, labels, cycles }
      });
      loadedProjectIdRef.current = projId;
    } catch (e) {
      console.error(`Failed to fetch project data for project ${projId}:`, e);
    }
  }, [clearProjectData]);

  // Load project data when active project changes
  useEffect(() => {
    if (activeProjectId) {
      fetchProjectData(activeProjectId);
    }
  }, [activeProjectId, fetchProjectData, state.labels]);

  useEffect(() => {
    let cancelled = false;
    const cachedUser = readStoredUser();

    fetch(`${AUTH_API_URL}/session`, { credentials: 'same-origin' })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (cancelled) {
          return;
        }

        if (response.ok && data && typeof data === 'object' && 'user' in data && data.user) {
          dispatch({ type: 'SET_USER', payload: data.user as User });
          return;
        }

        if (response.status === 401 || response.status === 403) {
          dispatch({ type: 'SET_USER', payload: null });
          return;
        }

        if (cachedUser) {
          dispatch({ type: 'SET_USER', payload: cachedUser });
          return;
        }

        dispatch({ type: 'SET_USER', payload: null });
      })
      .catch((error) => {
        console.error('Failed to restore session:', error);
        if (!cancelled) {
          if (cachedUser) {
            dispatch({ type: 'SET_USER', payload: cachedUser });
            return;
          }

          dispatch({ type: 'SET_USER', payload: null });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthResolved(true);
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Set default active project once projects are loaded
  useEffect(() => {
    if (!state.currentUser) {
      return;
    }

    if (state.projects.length > 0 && !activeProjectId) {
      setActiveProjectId(state.projects[0].id);
    }

    if (activeProjectId && !state.projects.some((project) => project.id === activeProjectId)) {
      loadedProjectIdRef.current = null;
      setActiveProjectId('');
    }
  }, [state.currentUser, state.projects, activeProjectId, setActiveProjectId]);

  useEffect(() => {
    if (!authResolved) {
      return;
    }

    if (!state.currentUser) {
      fetchInitialData();
      return;
    }

    fetchInitialData(state.currentUser.id);
  }, [authResolved, state.currentUser, fetchInitialData]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (state.currentUser) {
      window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(state.currentUser));
      return;
    }

    window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  }, [state.currentUser]);

  // 2. SSE subscription for real-time live synchronization
  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      return;
    }

    const eventSource = new EventSource(`${API_URL}/events/subscribe`);

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'tickets-updated') {
          if (message.data.projectId === activeProjectId) {
            dispatch({ type: 'SET_TICKETS_RAW', payload: message.data.tickets });
          }
        } else if (message.type === 'comments-updated') {
          // Narrow updates strictly to current active ticket
          const activeId = state.activeTicket?.id;
          if (activeId && activeId === message.data.ticketId) {
            dispatch({ type: 'SET_COMMENTS_RAW', payload: message.data.comments });
          }
        } else if (message.type === 'users-updated') {
          void (async () => {
            try {
              const usersResponse = await fetch(`${API_URL}/users`);
              const users = await handleArrayResponse<User>(usersResponse, 'Failed to refresh users');
              dispatch({
                type: 'SET_INITIAL_DATA',
                payload: {
                  tickets: state.tickets,
                  projects: state.projects,
                  labels: state.labels,
                  cycles: state.cycles,
                  users,
                }
              });
            } catch (error) {
              console.error('Failed to refresh users:', error);
            }
          })();
        }
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [activeProjectId, state.activeTicket, state.tickets, state.projects, state.labels, state.cycles]);

  // 3. Create Ticket with project header
  const createTicket = useCallback(async (ticketInput: CreateTicketInput) => {
    try {
      const response = await fetch(`${API_URL}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': ticketInput.projectId
        },
        body: JSON.stringify(ticketInput),
      });

      if (!response.ok) throw new Error('Failed to create ticket');
      const createdTicket = await response.json();

      // Update local state if the ticket belongs to the current active project
      if (ticketInput.projectId === activeProjectId) {
        await refreshTicketsForProject(activeProjectId, upsertTicket(state.tickets, createdTicket));
      }

      return createdTicket;
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [activeProjectId, refreshTicketsForProject, state.tickets]);

  const flushPendingTicketUpdate = useCallback(async (ticketId: string) => {
    const pendingBatch = pendingTicketUpdateBatchesRef.current.get(ticketId);
    if (!pendingBatch) {
      return;
    }

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
      const response = await fetch(`${API_URL}/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': pendingBatch.projectId,
        },
        body: JSON.stringify(pendingBatch.updates),
      });

      if (!response.ok) throw new Error('Failed to update ticket');

      inFlightTicketUpdateBatchesRef.current.delete(ticketId);

      const followUpBatch = pendingTicketUpdateBatchesRef.current.get(ticketId);
      if (followUpBatch && followUpBatch.flushRequested) {
        followUpBatch.flushRequested = false;
        void flushPendingTicketUpdate(ticketId);
      }
    } catch (e) {
      console.error('Error updating ticket on server, rolling back:', e);
      inFlightTicketUpdateBatchesRef.current.delete(ticketId);
      await refreshTicketsForProject(pendingBatch.projectId, pendingBatch.originalTickets);

      const followUpBatch = pendingTicketUpdateBatchesRef.current.get(ticketId);
      if (followUpBatch) {
        followUpBatch.originalTickets = pendingBatch.originalTickets;
        if (Object.keys(followUpBatch.updates).length > 0) {
          dispatch({ type: 'OPTIMISTIC_TICKET_UPDATE', payload: { id: ticketId, updates: followUpBatch.updates } });
        }

        if (followUpBatch.flushRequested) {
          followUpBatch.flushRequested = false;
          void flushPendingTicketUpdate(ticketId);
        }
      }
    }
  }, [dispatch, refreshTicketsForProject]);

  // 4. Update Ticket with project header
  const updateTicket = useCallback(async (id: string, updates: Partial<Ticket>) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;

    const pendingBatch = pendingTicketUpdateBatchesRef.current.get(id);
    if (!pendingBatch) {
      pendingTicketUpdateBatchesRef.current.set(id, {
        originalTickets: [...stateRef.current.tickets],
        projectId,
        updates: {},
        timerId: null,
        flushRequested: false,
      });
    }

    dispatch({ type: 'OPTIMISTIC_TICKET_UPDATE', payload: { id, updates } });

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
  }, [dispatch, flushPendingTicketUpdate]);

  // 5. Delete Ticket with project header
  const deleteTicket = useCallback(async (id: string) => {
    if (!activeProjectId) return;
    const originalTickets = [...state.tickets];
    dispatch({ type: 'SET_TICKETS_RAW', payload: state.tickets.filter(t => t.id !== id) });
    if (state.activeTicket?.id === id) {
      dispatch({ type: 'SET_ACTIVE_TICKET', payload: null });
    }

    try {
      const response = await fetch(`${API_URL}/tickets/${id}`, {
        method: 'DELETE',
        headers: { 'X-Project-Id': activeProjectId }
      });
      if (!response.ok) throw new Error('Failed to delete ticket');
    } catch (e) {
      console.error('Failed to delete, rolling back:', e);
      dispatch({ type: 'SET_TICKETS_RAW', payload: originalTickets });
    }
  }, [state.tickets, state.activeTicket, activeProjectId]);

  // 6. Fetch Comments for Selected Ticket with project header
  const fetchCommentsForTicket = useCallback(async (ticketId: string) => {
    if (!activeProjectId) return;
    try {
      const response = await fetch(`${API_URL}/tickets/${ticketId}/comments`, {
        headers: { 'X-Project-Id': activeProjectId }
      });
      if (response.ok) {
        const commentsList = await response.json();
        dispatch({ type: 'SET_COMMENTS_RAW', payload: commentsList });
      }
    } catch (e) {
      console.error(e);
    }
  }, [activeProjectId]);

  // Fetch comments whenever active ticket changes
  useEffect(() => {
    if (state.activeTicket) {
      fetchCommentsForTicket(state.activeTicket.id);
    } else {
      dispatch({ type: 'SET_COMMENTS_RAW', payload: [] });
    }
  }, [state.activeTicket, fetchCommentsForTicket]);

  // 7. Add Comment with project header
  const addComment = useCallback(async (ticketId: string, body: string) => {
    if (!state.currentUser || !activeProjectId) return;

    const optimisticId = `co-opt-${Date.now()}`;
    const optimisticComment: Comment = {
      id: optimisticId,
      ticketId,
      userId: state.currentUser.id,
      body,
      createdAt: new Date().toISOString(),
      userName: state.currentUser.name,
      userAvatar: state.currentUser.avatar,
      author: {
        id: state.currentUser.id,
        username: state.currentUser.name,
        avatar_url: state.currentUser.avatar,
        role: state.currentUser.role,
      },
    };
    dispatch({ type: 'ADD_COMMENT', payload: optimisticComment });

    try {
      const response = await fetch(`${API_URL}/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': activeProjectId
        },
        body: JSON.stringify({ userId: state.currentUser.id, body }),
      });
      if (!response.ok) throw new Error('Failed to post comment');

      const savedComment = (await response.json()) as Comment;
      dispatch({ type: 'REPLACE_COMMENT', payload: { optimisticId, comment: savedComment } });
    } catch (e) {
      console.error('Error posting comment, rolling back:', e);
      fetchCommentsForTicket(ticketId);
    }
  }, [state.currentUser, fetchCommentsForTicket, activeProjectId]);

  const updateComment = useCallback(async (ticketId: string, commentId: string, body: string) => {
    if (!activeProjectId) return;
    const originalComments = [...state.comments];
    dispatch({ type: 'UPDATE_COMMENT_RAW', payload: { commentId, body } });

    try {
      const response = await fetch(`${API_URL}/tickets/${ticketId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': activeProjectId,
        },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error('Failed to update comment');
    } catch (e) {
      console.error('Failed to update comment, rolling back:', e);
      dispatch({ type: 'SET_COMMENTS_RAW', payload: originalComments });
    }
  }, [state.comments, activeProjectId]);

  const deleteComment = useCallback(async (ticketId: string, commentId: string) => {
    if (!activeProjectId) return;
    const originalComments = [...state.comments];
    dispatch({ type: 'DELETE_COMMENT_RAW', payload: { commentId } });

    try {
      const response = await fetch(`${API_URL}/tickets/${ticketId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'X-Project-Id': activeProjectId,
        },
      });
      if (!response.ok) throw new Error('Failed to delete comment');
    } catch (e) {
      console.error('Failed to delete comment, rolling back:', e);
      dispatch({ type: 'SET_COMMENTS_RAW', payload: originalComments });
    }
  }, [state.comments, activeProjectId]);

  // Reusable helper to safely parse HTTP responses and return descriptive errors for network failures
  async function handleResponseJson(response: Response, fallbackError: string) {
    let text = '';
    try {
      text = await response.text();
    } catch (e) {
      // Ignore error reading body
    }

    if (!response.ok) {
      let errorMessage = fallbackError;
      try {
        const parsed = text ? JSON.parse(text) : null;
        errorMessage = parsed?.error || parsed?.message || fallbackError;
      } catch {
        // If response is HTML, it's likely a proxy/gateway/server error page
        if (text.includes('<!DOCTYPE html>') || text.includes('<html') || text.includes('<body')) {
          errorMessage = `${fallbackError}: Server returned an HTML page instead of JSON. The backend server might be down, crashed, or unreachable (Status ${response.status}).`;
        } else if (text) {
          errorMessage = `${fallbackError}: ${text.slice(0, 150)}`;
        } else {
          errorMessage = `${fallbackError} (Status ${response.status})`;
        }
      }
      throw new Error(errorMessage);
    }

    try {
      return text ? JSON.parse(text) : {};
    } catch (e) {
      throw new Error(`Invalid response format from server (Status ${response.status})`);
    }
  }

  async function handleArrayResponse<T>(response: Response, fallbackError: string) {
    const data = await handleResponseJson(response, fallbackError);
    if (!Array.isArray(data)) {
      throw new Error(`${fallbackError}: Expected an array response.`);
    }

    return data as T[];
  }

  async function refreshTicketsForProject(projectId: string, fallbackTickets?: Ticket[]) {
    try {
      const response = await fetch(`${API_URL}/tickets`, { headers: { 'X-Project-Id': projectId } });
      const tickets = await handleArrayResponse<Ticket>(response, `Failed to refresh tickets for project ${projectId}`);
      dispatch({ type: 'SET_TICKETS_RAW', payload: tickets });
      return tickets;
    } catch (error) {
      console.error(`Failed to refresh tickets for project ${projectId}:`, error);
      if (fallbackTickets) {
        dispatch({ type: 'SET_TICKETS_RAW', payload: fallbackTickets });
      }
      return null;
    }
  }

  const createProject = useCallback(async (projectInput: CreateProjectInput) => {
    if (!state.currentUser) {
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...projectInput,
          ownerId: state.currentUser.id,
          status: projectInput.status || 'active',
        }),
      });

      const project = await handleResponseJson(response, 'Failed to create project');
      await fetchInitialData(state.currentUser.id);
      setActiveProjectId(project.id);
      return project;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [state.currentUser, fetchInitialData, setActiveProjectId]);

  const createLabel = useCallback(async (labelInput: { name: string; color?: string; description?: string; projectId?: string; sortOrder?: number }) => {
    const projectId = labelInput.projectId || activeProjectId;
    if (!projectId) {
      return null;
    }

    const existingProjectLabels = state.labels.filter((label) => label.projectId === projectId);
    const nextSortOrder =
      labelInput.sortOrder ??
      existingProjectLabels.reduce((maxSortOrder, label) => Math.max(maxSortOrder, Number(label.sortOrder ?? 0)), -1) + 1;

    try {
      const response = await fetch(`${API_URL}/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': projectId,
        },
        body: JSON.stringify({
          name: labelInput.name,
          color: labelInput.color || '#6B7280',
          description: labelInput.description || '',
          sortOrder: nextSortOrder,
        }),
      });

      const label = await handleResponseJson(response, 'Failed to create label');
      await fetchProjectData(projectId);
      return label;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [activeProjectId, fetchProjectData]);

  const updateLabel = useCallback(async (id: string, updates: Partial<Label>) => {
    try {
      const response = await fetch(`${API_URL}/labels/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      const label = await handleResponseJson(response, 'Failed to update label');
      if (activeProjectId) {
        await fetchProjectData(activeProjectId);
      }
      return label;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [activeProjectId, fetchProjectData]);

  const deleteLabel = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/labels/${id}`, {
        method: 'DELETE',
      });

      await handleResponseJson(response, 'Failed to delete label');
      if (activeProjectId) {
        await fetchProjectData(activeProjectId);
      }
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }, [activeProjectId, fetchProjectData]);

  const assignLabelToTicket = useCallback(async (ticketId: string, labelId: string) => {
    try {
      const response = await fetch(`${API_URL}/tickets/${ticketId}/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labelId }),
      });

      if (!response.ok) throw new Error('Failed to assign label');

      if (activeProjectId) {
        await refreshTicketsForProject(activeProjectId);
      }
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }, [activeProjectId, refreshTicketsForProject]);

  const unassignLabelFromTicket = useCallback(async (ticketId: string, labelId: string) => {
    try {
      const response = await fetch(`${API_URL}/tickets/${ticketId}/labels/${labelId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to unassign label');

      if (activeProjectId) {
        await refreshTicketsForProject(activeProjectId);
      }
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }, [activeProjectId, refreshTicketsForProject]);

  const joinProject = useCallback(async (inviteCode: string) => {
    if (!state.currentUser) {
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/projects/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode, userId: state.currentUser.id }),
      });

      const data = await handleResponseJson(response, 'Failed to join project');
      await fetchInitialData(state.currentUser.id);
      setActiveProjectId(data.project.id);
      return data.project;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [state.currentUser, fetchInitialData, setActiveProjectId]);

  // 8. Authentication Actions (Better-Auth inspired credentials flows)
  const signIn = useCallback(async (email: string, password?: string) => {
    try {
      const response = await fetch(`${AUTH_API_URL}/sign-in`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await handleResponseJson(response, 'Sign in failed');
      dispatch({ type: 'SET_USER', payload: data.user });
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

      const data = await handleResponseJson(response, 'Registration failed');
      dispatch({ type: 'SET_USER', payload: data.user });
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

    dispatch({ type: 'SET_USER', payload: null });
    clearWorkspaceData();
  }, [clearWorkspaceData]);

  const setCurrentUser = useCallback((user: User | null) => {
    dispatch({ type: 'SET_USER', payload: user });
  }, []);

  const setTheme = useCallback((theme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue') => {
    dispatch({ type: 'SET_THEME_RAW', payload: theme });
  }, []);

  const setActiveTicket = useCallback((ticket: Ticket | null) => {
    dispatch({ type: 'SET_ACTIVE_TICKET', payload: ticket });
  }, []);

  const setView = useCallback((view: 'list' | 'board') => {
    dispatch({ type: 'SET_VIEW', payload: view });
  }, []);

  const setFilters = useCallback((filters: Partial<State['filters']>) => {
    dispatch({ type: 'SET_FILTERS', payload: filters });
  }, []);

  const resetFilters = useCallback(() => {
    dispatch({ type: 'SET_FILTERS', payload: { ...initialFilters, projectId: activeProjectId } });
  }, [activeProjectId]);

  const ticketMap = useMemo(() => new Map(state.tickets.map(t => [t.key.toUpperCase(), t])), [state.tickets]);

  const value = useMemo(
    () => ({
      ...state,
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
      addComment,
      updateComment,
      deleteComment,
      createProject,
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
      state,
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
      addComment,
      updateComment,
      deleteComment,
      createProject,
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
    ]
  );

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
};

export const useTickets = () => {
  const context = useContext(TicketContext);
  if (!context) throw new Error('useTickets must be used within a TicketProvider');
  return context;
};
