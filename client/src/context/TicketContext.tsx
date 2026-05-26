import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';

// Domain entity types live in src/types/domain.ts.
// They are re-exported here for backwards compatibility — all existing import
// sites pointing to this file continue to work without any changes.
export type {
  User,
  Project,
  Domain,
  Cycle,
  Ticket,
  Comment,
  CreateProjectInput,
} from '../types/domain';
import type { User, Project, Domain, Cycle, Ticket, Comment, CreateProjectInput } from '../types/domain';

interface State {
  tickets: Ticket[];
  projects: Project[];
  domains: Domain[];
  cycles: Cycle[];
  users: User[];
  comments: Comment[];
  activeTicket: Ticket | null;
  activeView: 'list' | 'board';
  filters: {
    status: string;
    priority: string;
    projectId: string;
    domainId: string;
    cycleId: string;
    assigneeId: string;
    search: string;
  };
  currentUser: User | null;
  theme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue';
  loading: boolean;
}

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'CLEAR_WORKSPACE_DATA' }
  | { type: 'CLEAR_PROJECT_DATA' }
  | {
    type: 'SET_INITIAL_DATA';
    payload: {
      tickets: Ticket[];
      projects: Project[];
      domains: Domain[];
      cycles: Cycle[];
      users: User[];
    };
  }
  | { type: 'SET_PROJECT_DATA'; payload: { tickets: Ticket[]; domains: Domain[]; cycles: Cycle[] } }
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
  domainId: '',
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
    domains: [],
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
        domains: [],
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
        domains: [],
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
        tickets: action.payload.tickets,
        domains: action.payload.domains,
        cycles: action.payload.cycles,
      };
    case 'SET_TICKETS_RAW': {
      let nextActive = state.activeTicket;
      if (nextActive) {
        const found = action.payload.find(t => t.id === nextActive!.id);
        if (found) nextActive = found;
      }
      return { ...state, tickets: action.payload, activeTicket: nextActive };
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
  createDomain: (domain: { name: string; color?: string; projectId?: string }) => Promise<Domain | null>;
  createTicket: (ticket: Omit<Ticket, 'id' | 'key' | 'prStatus' | 'prUrl' | 'createdAt' | 'updatedAt'>) => Promise<Ticket | null>;
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
}

export const TicketContext = createContext<TicketContextType | undefined>(undefined);

export const TicketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(ticketReducer, undefined, createInitialState);
  const [activeProjectId, setActiveProjectIdState] = React.useState<string>('');
  const [authResolved, setAuthResolved] = React.useState(false);
  const loadedUserIdRef = React.useRef<string | null>(null);
  const loadedProjectIdRef = React.useRef<string | null>(null);

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
        payload: { tickets: [], projects, domains: [], cycles: [], users },
      });
      loadedUserIdRef.current = userId;
    } catch (error) {
      console.error('Failed to load initial workspace data:', error);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [clearWorkspaceData]);

  // Fetch project-specific data (tickets, domains, cycles)
  const fetchProjectData = useCallback(async (projId: string) => {
    if (!projId) return;

    const isProjectTransition = loadedProjectIdRef.current !== null && loadedProjectIdRef.current !== projId;
    if (isProjectTransition) {
      clearProjectData();
    }

    try {
      const [ticketsRes, domainsRes, cyclesRes] = await Promise.all([
        fetch(`${API_URL}/tickets`, { headers: { 'X-Project-Id': projId } }),
        fetch(`${API_URL}/domains`, { headers: { 'X-Project-Id': projId } }),
        fetch(`${API_URL}/cycles`, { headers: { 'X-Project-Id': projId } }),
      ]);

      const [tickets, domains, cycles] = await Promise.all([
        handleArrayResponse<Ticket>(ticketsRes, `Failed to load tickets for project ${projId}`),
        handleArrayResponse<Domain>(domainsRes, `Failed to load domains for project ${projId}`),
        handleArrayResponse<Cycle>(cyclesRes, `Failed to load cycles for project ${projId}`),
      ]);

      dispatch({
        type: 'SET_PROJECT_DATA',
        payload: { tickets, domains, cycles }
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
  }, [activeProjectId, fetchProjectData]);

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
                  domains: state.domains,
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
  }, [activeProjectId, state.activeTicket, state.tickets, state.projects, state.domains, state.cycles]);

  // 3. Create Ticket with project header
  const createTicket = useCallback(async (ticketInput: any) => {
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
        const listRes = await fetch(`${API_URL}/tickets`, { headers: { 'X-Project-Id': activeProjectId } });
        const allTickets = await listRes.json();
        dispatch({ type: 'SET_TICKETS_RAW', payload: allTickets });
      }

      return createdTicket;
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [activeProjectId]);

  // 4. Update Ticket with project header
  const updateTicket = useCallback(async (id: string, updates: Partial<Ticket>) => {
    if (!activeProjectId) return;
    dispatch({ type: 'OPTIMISTIC_TICKET_UPDATE', payload: { id, updates } });

    try {
      const response = await fetch(`${API_URL}/tickets/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': activeProjectId
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update ticket');
    } catch (e) {
      console.error('Error updating ticket on server, rolling back:', e);
      const response = await fetch(`${API_URL}/tickets`, { headers: { 'X-Project-Id': activeProjectId } });
      const freshTickets = await response.json();
      dispatch({ type: 'SET_TICKETS_RAW', payload: freshTickets });
    }
  }, [activeProjectId]);

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

  const createDomain = useCallback(async (domainInput: { name: string; color?: string; projectId?: string }) => {
    const projectId = domainInput.projectId || activeProjectId;
    if (!projectId) {
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': projectId,
        },
        body: JSON.stringify({
          name: domainInput.name,
          color: domainInput.color || '#6B7280',
        }),
      });

      const domain = await handleResponseJson(response, 'Failed to create domain');
      await fetchProjectData(projectId);
      return domain;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [activeProjectId, fetchProjectData]);

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

  const value = useMemo(
    () => ({
      ...state,
      activeProjectId,
      setActiveProjectId,
      fetchInitialData,
      fetchProjectData,
      createDomain,
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
    }),
    [
      state,
      activeProjectId,
      setActiveProjectId,
      fetchInitialData,
      fetchProjectData,
      createDomain,
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
    ]
  );

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
};

export const useTickets = () => {
  const context = useContext(TicketContext);
  if (!context) throw new Error('useTickets must be used within a TicketProvider');
  return context;
};
