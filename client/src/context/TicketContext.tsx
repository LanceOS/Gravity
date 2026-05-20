import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';

// Type definitions matching the backend API contract.
export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  tutorial_completed?: number | boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  key: string;
  status: 'planned' | 'active' | 'completed';
  workspaceId?: string | null;
}

type CreateProjectInput = {
  name: string;
  description: string;
  key: string;
  status?: Project['status'];
  workspaceId?: string;
};

export interface Domain {
  id: string;
  name: string;
  color: string;
}

export interface Cycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  completed: number;
}

export interface Ticket {
  id: string;
  key: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';
  priority: 'no_priority' | 'low' | 'medium' | 'high' | 'urgent';
  assigneeId: string | null;
  projectId: string;
  domainId: string | null;
  cycleId: string | null;
  parentId: string | null;
  prStatus: 'open' | 'merged' | 'closed' | 'none';
  prUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  ticketId: string;
  userId: string;
  body: string;
  createdAt: string;
  userName?: string;
  userAvatar?: string;
}

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
  theme: 'dark' | 'light';
  loading: boolean;
}

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
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
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_THEME_RAW'; payload: 'dark' | 'light' }
  | { type: 'ADD_COMMENT'; payload: Comment }
  | { type: 'OPTIMISTIC_TICKET_UPDATE'; payload: { id: string; updates: Partial<Ticket> } };

const initialFilters = {
  status: '',
  priority: '',
  projectId: '',
  domainId: '',
  cycleId: '',
  assigneeId: '',
  search: '',
};

const initialState: State = {
  tickets: [],
  projects: [],
  domains: [],
  cycles: [],
  users: [],
  comments: [],
  activeTicket: null,
  activeView: 'board',
  filters: initialFilters,
  currentUser: null,
  theme: 'dark',
  loading: false,
};

// API Base URL
const API_URL = '';

function ticketReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
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
    case 'TOGGLE_THEME': {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
      return { ...state, theme: nextTheme };
    }
    case 'SET_THEME_RAW':
      return { ...state, theme: action.payload };
    case 'ADD_COMMENT':
      return { ...state, comments: [...state.comments, action.payload] };
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
    default:
      return state;
  }
}

interface TicketContextType extends State {
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  fetchInitialData: (userId?: string) => Promise<void>;
  fetchProjectData: (projId: string) => Promise<void>;
  createTicket: (ticket: Omit<Ticket, 'id' | 'key' | 'prStatus' | 'prUrl' | 'createdAt' | 'updatedAt'>) => Promise<Ticket | null>;
  updateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
  deleteTicket: (id: string) => Promise<void>;
  addComment: (ticketId: string, body: string) => Promise<void>;
  createProject: (project: CreateProjectInput) => Promise<Project | null>;
  joinProject: (inviteCode: string) => Promise<Project | null>;
  signIn: (email: string, password?: string) => Promise<boolean>;
  signUp: (name: string, email: string, password?: string) => Promise<boolean>;
  signOut: () => void;
  setCurrentUser: (user: User | null) => void;
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setActiveTicket: (ticket: Ticket | null) => void;
  setView: (view: 'list' | 'board') => void;
  setFilters: (filters: Partial<State['filters']>) => void;
  resetFilters: () => void;
}

const TicketContext = createContext<TicketContextType | undefined>(undefined);

export const TicketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(ticketReducer, initialState);
  const [activeProjectId, setActiveProjectIdState] = React.useState<string>('');

  const setActiveProjectId = useCallback((id: string) => {
    setActiveProjectIdState(id);
    // Sync filters projectId
    dispatch({ type: 'SET_FILTERS', payload: { projectId: id } });
  }, []);

  // 1. Fetch initial central data (projects, users)
  const fetchInitialData = useCallback(async (userId?: string) => {
    if (!userId) {
      dispatch({
        type: 'SET_INITIAL_DATA',
        payload: { tickets: [], projects: [], domains: [], cycles: [], users: [] },
      });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const [projectsRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/api/projects?userId=${encodeURIComponent(userId)}`),
        fetch(`${API_URL}/api/users`),
      ]);

      const projects = await projectsRes.json();
      const users = await usersRes.json();

      dispatch({
        type: 'SET_INITIAL_DATA',
        payload: { tickets: [], projects, domains: [], cycles: [], users },
      });
    } catch (error) {
      console.error('Failed to load initial workspace data:', error);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // Fetch project-specific data (tickets, domains, cycles)
  const fetchProjectData = useCallback(async (projId: string) => {
    if (!projId) return;
    try {
      const [ticketsRes, domainsRes, cyclesRes] = await Promise.all([
        fetch(`${API_URL}/api/tickets`, { headers: { 'X-Project-Id': projId } }),
        fetch(`${API_URL}/api/domains`, { headers: { 'X-Project-Id': projId } }),
        fetch(`${API_URL}/api/cycles`, { headers: { 'X-Project-Id': projId } }),
      ]);

      const tickets = await ticketsRes.json();
      const domains = await domainsRes.json();
      const cycles = await cyclesRes.json();

      dispatch({
        type: 'SET_PROJECT_DATA',
        payload: { tickets, domains, cycles }
      });
    } catch (e) {
      console.error(`Failed to fetch project data for project ${projId}:`, e);
    }
  }, []);

  // Load project data when active project changes
  useEffect(() => {
    if (activeProjectId) {
      fetchProjectData(activeProjectId);
    }
  }, [activeProjectId, fetchProjectData]);

  // Set default active project once projects are loaded
  useEffect(() => {
    if (!state.currentUser) {
      return;
    }

    if (state.projects.length > 0 && !activeProjectId) {
      setActiveProjectId(state.projects[0].id);
    }

    if (activeProjectId && !state.projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectIdState('');
    }
  }, [state.currentUser, state.projects, activeProjectId, setActiveProjectId]);

  useEffect(() => {
    if (!state.currentUser) {
      fetchInitialData();
      setActiveProjectIdState('');
      dispatch({ type: 'SET_ACTIVE_TICKET', payload: null });
      dispatch({ type: 'SET_COMMENTS_RAW', payload: [] });
      return;
    }

    fetchInitialData(state.currentUser.id);
  }, [state.currentUser, fetchInitialData]);

  // Sync user settings (default view and theme) when user logs in
  useEffect(() => {
    if (state.currentUser) {
      fetch(`${API_URL}/api/settings/${state.currentUser.id}`)
        .then(res => res.json())
        .then(data => {
          if (data) {
            if (data.theme) {
              dispatch({ type: 'SET_THEME_RAW', payload: data.theme });
            }
            if (data.defaultView) {
              dispatch({ type: 'SET_VIEW', payload: data.defaultView });
            }
          }
        })
        .catch(err => console.error('Failed to load settings on login:', err));
    }
  }, [state.currentUser]);

  // 2. SSE subscription for real-time live synchronization
  useEffect(() => {
    const eventSource = new EventSource(`${API_URL}/api/events/subscribe`);

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
          fetch(`${API_URL}/api/users`)
            .then(res => res.json())
            .then(users => {
              dispatch({
                type: 'SET_INITIAL_DATA',
                payload: {
                  tickets: state.tickets,
                  projects: state.projects,
                  domains: state.domains,
                  cycles: state.cycles,
                  users: users
                }
              });
            });
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
      const response = await fetch(`${API_URL}/api/tickets`, {
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
        const listRes = await fetch(`${API_URL}/api/tickets`, { headers: { 'X-Project-Id': activeProjectId } });
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
      const response = await fetch(`${API_URL}/api/tickets/${id}`, {
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
      const response = await fetch(`${API_URL}/api/tickets`, { headers: { 'X-Project-Id': activeProjectId } });
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
      const response = await fetch(`${API_URL}/api/tickets/${id}`, {
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
      const response = await fetch(`${API_URL}/api/tickets/${ticketId}/comments`, {
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
    
    const optimisticComment: Comment = {
      id: `co-opt-${Date.now()}`,
      ticketId,
      userId: state.currentUser.id,
      body,
      createdAt: new Date().toISOString(),
      userName: state.currentUser.name,
      userAvatar: state.currentUser.avatar,
    };
    dispatch({ type: 'ADD_COMMENT', payload: optimisticComment });

    try {
      const response = await fetch(`${API_URL}/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Project-Id': activeProjectId
        },
        body: JSON.stringify({ userId: state.currentUser.id, body }),
      });
      if (!response.ok) throw new Error('Failed to post comment');
      
      fetchCommentsForTicket(ticketId);
    } catch (e) {
      console.error('Error posting comment, rolling back:', e);
      fetchCommentsForTicket(ticketId);
    }
  }, [state.currentUser, fetchCommentsForTicket, activeProjectId]);

  const createProject = useCallback(async (projectInput: CreateProjectInput) => {
    if (!state.currentUser) {
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...projectInput,
          ownerId: state.currentUser.id,
          status: projectInput.status || 'active',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create project');
      }

      const project = await response.json();
      await fetchInitialData(state.currentUser.id);
      setActiveProjectId(project.id);
      return project;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [state.currentUser, fetchInitialData, setActiveProjectId]);

  const joinProject = useCallback(async (inviteCode: string) => {
    if (!state.currentUser) {
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/api/projects/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode, userId: state.currentUser.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join project');
      }

      const data = await response.json();
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
      const response = await fetch(`${API_URL}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Sign in failed');
      }

      const data = await response.json();
      dispatch({ type: 'SET_USER', payload: data.user });
      return true;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password?: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/sign-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Registration failed');
      }

      const data = await response.json();
      dispatch({ type: 'SET_USER', payload: data.user });
      return true;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, []);

  const signOut = useCallback(() => {
    dispatch({ type: 'SET_USER', payload: null });
    setActiveProjectIdState('');
  }, []);

  const setCurrentUser = useCallback((user: User | null) => {
    dispatch({ type: 'SET_USER', payload: user });
  }, []);

  // 9. Layout Adjustments
  const toggleTheme = useCallback(() => {
    dispatch({ type: 'TOGGLE_THEME' });
  }, []);

  const setTheme = useCallback((theme: 'dark' | 'light') => {
    dispatch({ type: 'SET_THEME_RAW', payload: theme });
  }, []);

  // Apply theme to document element
  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'dark') {
      root.classList.add('dark-theme');
    } else {
      root.classList.remove('dark-theme');
    }
  }, [state.theme]);

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
      createTicket,
      updateTicket,
      deleteTicket,
      addComment,
      createProject,
      joinProject,
      signIn,
      signUp,
      signOut,
      setCurrentUser,
      toggleTheme,
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
      createTicket,
      updateTicket,
      deleteTicket,
      addComment,
      createProject,
      joinProject,
      signIn,
      signUp,
      signOut,
      setCurrentUser,
      toggleTheme,
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
