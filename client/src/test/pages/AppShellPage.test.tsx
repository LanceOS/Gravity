import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, Route, Routes } from 'react-router-dom';
import { AppShellPage } from '../../pages/AppShellPage/AppShellPage.tsx';
import { WorkspaceShellPage } from '../../pages/WorkspaceShellPage/WorkspaceShellPage.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryClient as sharedQueryClient, queryKeys } from '../../utils/queryClient';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Helper: captures the current MemoryRouter URL from inside the tree. */
function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="location-display">{loc.pathname}{loc.search}</div>;
}

type WorkspaceLayoutMockProps = {
  sidebarProps: {
    userMenu: {
      onOpenSettings: () => void;
      onOpenAccountPreferences: () => void;
      onOpenProjectManager: () => void;
      showWorkspaceManagement?: boolean;
      workspaceManagementLabel?: string;
      workspaceManagementArea?: string;
    };
    projects?: {
      onSelectLabel?: (projectId: string, labelId: string) => void;
      onSelectWorkspaceProjects?: () => void;
      onOpenCreateTeam?: () => void;
      counts?: any;
    };
  };
  children?: ReactNode;
  rightPanels?: ReactNode;
};

type WorkspacePageMockProps = {
  activeView?: string;
  filters?: {
    projectId?: string;
  };
  onSelectNote?: (noteId: string) => void;
  onSelectTicket?: (ticket: any) => void;
  onDeleteTicket?: (ticketId: string) => void;
  projects?: unknown[];
  tickets?: unknown[];
  viewModeLocked?: boolean;
};

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useUserDirectory: vi.fn(),
  useActiveProject: vi.fn(),
  useProjectContext: vi.fn(),
  useTicketListContext: vi.fn(),
  useCommentContext: vi.fn(),
  useTicketDetailContext: vi.fn(),
  useTicketRelationsContext: vi.fn(),
  useTicketMutations: vi.fn(),
  useWorkspaceDirectory: vi.fn(),
  useAccountSettings: vi.fn(),
  useWorkspaceSettings: vi.fn(),
  useTicketFilters: vi.fn(),
  useActiveView: vi.fn(),
  registerWebMCPTools: vi.fn(() => null),
  fetch: vi.fn(),
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('../../context/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/auth/AuthContext')>();
  return {
    ...actual,
    useAuth: mocks.useAuth,
  };
});

vi.mock('../../context/user/UserDirectoryContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/user/UserDirectoryContext')>();
  return {
    ...actual,
    useUserDirectory: mocks.useUserDirectory,
  };
});

vi.mock('../../context/project/ActiveProjectContext', () => ({
  useActiveProject: mocks.useActiveProject,
}));

vi.mock('../../context/project/ProjectContext', () => ({
  useProjectContext: mocks.useProjectContext,
}));

vi.mock('../../context/TicketContext', () => ({
  WorkspaceTicketActionProviders: ({ children }: { children: ReactNode }) => (
    <div data-testid="workspace-ticket-action-provider">{children}</div>
  ),
}));

vi.mock('../../context/ticket/TicketListContext', () => ({
  useTicketListContext: mocks.useTicketListContext,
}));

vi.mock('../../context/comment/CommentContext', () => ({
  useCommentContext: mocks.useCommentContext,
  useOptionalCommentContext: mocks.useCommentContext,
}));

vi.mock('../../context/ticket/TicketDetailContext', () => ({
  useTicketDetailContext: mocks.useTicketDetailContext,
  useOptionalTicketDetailContext: mocks.useTicketDetailContext,
}));

vi.mock('../../context/relation/TicketRelationsContext', () => ({
  useTicketRelationsContext: mocks.useTicketRelationsContext,
  useOptionalTicketRelationsContext: mocks.useTicketRelationsContext,
}));

vi.mock('../../context/ticket/TicketMutationContext', () => ({
  useTicketMutations: mocks.useTicketMutations,
  useOptionalTicketMutations: mocks.useTicketMutations,
}));

vi.mock('../../context/label/LabelContext', () => ({
  useLabels: () => ({ labels: [], globalLabels: [], labelsByProject: new Map(), assignLabelToTicket: vi.fn(), unassignLabelFromTicket: vi.fn(), createLabel: vi.fn(), updateLabel: vi.fn(), deleteLabel: vi.fn() }),
}));
vi.mock('../../context/cycle/CycleContext', () => ({
  useCycles: () => ({ cycles: [] }),
}));

vi.mock('../../hooks/useWorkspaceDirectory', () => ({
  useWorkspaceDirectory: mocks.useWorkspaceDirectory,
}));

vi.mock('../../hooks/useAccountSettings', () => ({
  useAccountSettings: mocks.useAccountSettings,
}));

vi.mock('../../hooks/useWorkspaceSettings', () => ({
  useWorkspaceSettings: mocks.useWorkspaceSettings,
}));

vi.mock('../../context/filters/TicketFiltersContext', () => ({
  useTicketFilters: mocks.useTicketFilters,
}));

vi.mock('../../context/ui/ActiveViewContext', () => ({
  useActiveView: mocks.useActiveView,
}));

vi.mock('../../modules/settings', () => ({
  useTheme: () => ({
    setDensity: vi.fn(),
    setTheme: vi.fn(),
  }),
  SettingsScreen: () => <div>SettingsPage</div>,
}));

vi.mock('../../utils/webmcp', () => ({
  registerWebMCPTools: mocks.registerWebMCPTools,
}));

vi.mock('../../modules/ai', () => ({
  AgentSimulator: () => <div>AgentSimulator</div>,
  LocalAIChat: () => <div>LocalAIChat</div>,
}));

vi.mock('../../modules/auth', () => ({
  AuthScreen: () => <div>AuthScreen</div>,
}));

vi.mock('../../modules/tickets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../modules/tickets')>();

  return {
    ...actual,
  CreateTicketModal: ({ isOpen }: any) => isOpen ? <div>CreateTicketModal</div> : null,
  LabelCreateOverlay: ({ isOpen }: any) => isOpen ? <div>LabelCreateOverlay</div> : null,
  TicketDetailRoute: ({ onDeleteTicket, activeTicket }: any) => (
    <div>
      <div>TicketDetailRoute Mock</div>
      {onDeleteTicket && activeTicket && (
        <button type="button" onClick={() => onDeleteTicket(activeTicket.id)}>
          Delete active ticket
        </button>
      )}
    </div>
  ),
  };
});

vi.mock('../../modules/onboarding', () => ({
  OnboardingModal: ({ onComplete }: { onComplete: () => void }) => (
    <div>
      <div>OnboardingModal</div>
      <button type="button" onClick={onComplete}>
        Complete onboarding
      </button>
    </div>
  ),
}));

vi.mock('../../layouts/WorkspaceLayout/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ sidebarProps, children, rightPanels }: WorkspaceLayoutMockProps) => (
    <div>
      <div>WorkspaceLayout</div>
      {sidebarProps.projects?.counts?.byProject ? (
        <pre data-testid="sidebar-counts-by-project">
          {JSON.stringify(sidebarProps.projects.counts.byProject)}
        </pre>
      ) : null}
      <button type="button" onClick={sidebarProps.userMenu.onOpenSettings}>
        Open settings
      </button>
      <button type="button" onClick={sidebarProps.userMenu.onOpenAccountPreferences}>
        Open account preferences
      </button>
      <button type="button" onClick={sidebarProps.userMenu.onOpenProjectManager}>
        Open project manager
      </button>
      <button type="button" onClick={() => sidebarProps.projects?.onSelectWorkspaceProjects?.()}>
        Open workspace projects
      </button>
      <div
        data-testid="workspace-management-menu-state"
        data-visible={sidebarProps.userMenu.showWorkspaceManagement === false ? 'false' : 'true'}
      >
        {sidebarProps.userMenu.workspaceManagementLabel || 'Manage Projects'}
      </div>
      <button
        type="button"
        onClick={() => sidebarProps.projects?.onSelectLabel?.('project-1', 'd-1')}
      >
        Select label
      </button>
      <button type="button" onClick={() => sidebarProps.projects?.onOpenCreateTeam?.()}>
        Open create team
      </button>
      {children}
      {rightPanels}
    </div>
  ),
}));

vi.mock('../../modules/loadingPage', () => ({
  LoadingPage: () => <div>LoadingPage</div>,
}));

vi.mock('../../modules/workspaceDirectoryPage', () => ({
  WorkspaceDirectoryPage: () => <div>WorkspaceDirectoryPage</div>,
}));

vi.mock('../../modules/workspacePage', () => ({
  WorkspacePage: ({
    activeView,
    filters,
    onSelectNote,
    onSelectTicket,
    onDeleteTicket,
    projects = [],
    tickets = [],
    viewModeLocked,
  }: WorkspacePageMockProps) => (
    <div>
      <div>WorkspacePage</div>
      <div
        data-testid="workspace-page-state"
        data-active-view={activeView}
        data-project-count={projects.length}
        data-project-filter={filters?.projectId ?? ''}
        data-ticket-count={tickets.length}
        data-view-mode-locked={viewModeLocked ? 'true' : 'false'}
      />
      {onSelectNote ? (
        <button type="button" onClick={() => onSelectNote('note-1')}>
          Open note
        </button>
      ) : null}
      {onSelectTicket && tickets[0] ? (
        <button type="button" onClick={() => onSelectTicket(tickets[0])}>
          Open first ticket
        </button>
      ) : null}
      {onDeleteTicket ? (
        <button type="button" onClick={() => onDeleteTicket('t-1')}>
          Delete active ticket
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('../../modules/workspaceProjectsListPage', () => ({
  WorkspaceProjectsListPage: () => <div>WorkspaceProjectsListPage</div>,
}));

vi.mock('../../modules/workspaceTeamsPage', () => ({
  WorkspaceTeamsPage: () => <div>WorkspaceTeamsPage</div>,
}));

vi.mock('../../modules/workspaceTeamProjectsPage', () => ({
  WorkspaceTeamProjectsPage: ({ team, projects, onBackToTeams }: any) => (
    <div>
      <div>WorkspaceTeamProjectsPage</div>
      <div data-testid="team-projects-state">{`${team?.name ?? 'none'} ${projects.length}`}</div>
      <button type="button" onClick={onBackToTeams}>
        Back to Teams
      </button>
    </div>
  ),
}));

vi.mock('../../pages/AccountPreferencesPage/AccountPreferencesPage', () => ({
  AccountPreferencesPage: () => <div>AccountPreferencesPage</div>,
}));

function makeCurrentUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    name: 'Casey Carter',
    email: 'casey@example.com',
    avatar: '',
    role: 'owner',
    tutorial_completed: 1,
    ...overrides,
  };
}

function buildUseTickets(overrides: Partial<Record<string, unknown>> = {}) {
  const currentUser = 'currentUser' in overrides
    ? (overrides.currentUser as ReturnType<typeof makeCurrentUser> | null)
    : makeCurrentUser();
  const defaultTickets = [
    {
      id: 'ticket-1',
      key: 'GRA-1',
      title: 'Seed ticket',
      description: '',
      status: 'todo',
      priority: 'medium',
      projectId: 'project-1',
      domainId: null,
      cycleId: null,
      assigneeId: null,
      parentId: null,
      prStatus: 'none',
      prUrl: null,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ];
  const tickets = (Array.isArray(overrides.tickets) ? overrides.tickets : defaultTickets) as any[];
  const users = (Array.isArray(overrides.users) ? overrides.users : [currentUser].filter(Boolean)) as any[];
  const ticketsByProject = new Map<string, unknown[]>();
  for (const ticket of tickets as any[]) {
    const projectTickets = ticketsByProject.get(ticket.projectId) || [];
    projectTickets.push(ticket);
    ticketsByProject.set(ticket.projectId, projectTickets);
  }

  return {
    activeProjectId: 'project-1',
    activeTicket: null,
    activeView: 'board',
    addComment: vi.fn(),
    addTicketDependency: vi.fn(),
    addTicketBlocker: vi.fn(),
    comments: [],
    createLabel: vi.fn(),
    createProject: vi.fn(),
    createTicket: vi.fn(),
    currentUser,
    cycles: [],
    deleteTicket: vi.fn(),
    labels: [],
    fetchInitialData: vi.fn(),
    filters: {
      search: '',
      priority: '',
      status: '',
      projectId: '',
      labels: [] as string[],
      labelMode: 'any' as 'all' | 'any',
      cycleId: '',
      assigneeId: '',
    },
    loading: false,
    projects: [
      {
        id: 'project-1',
        name: 'Gravity Core',
        key: 'GRA',
        description: 'Primary project',
        status: 'active',
        workspaceId: 'workspace-1',
      },
    ],
    setActiveProjectId: vi.fn(),
    setActiveTicket: vi.fn(),
    setCurrentUser: vi.fn(),
    setFilters: vi.fn(),
    setTheme: vi.fn(),
    setView: vi.fn(),
    removeTicketDependency: vi.fn(),
    removeTicketBlocker: vi.fn(),
    signOut: vi.fn(),
    theme: 'dark',
    ticketMap: new Map(tickets.map((ticket) => [ticket.key.toUpperCase(), ticket])),
    ticketById: new Map(tickets.map((ticket) => [ticket.id, ticket])),
    ticketsByProject,
    tickets,
    updateTicket: vi.fn(),
    users,
    ...overrides,
  };
}

function buildUseTicketMutations(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createTicket: vi.fn(),
    updateTicket: vi.fn(),
    deleteTicket: vi.fn(),
    moveTicket: vi.fn(),
    ...overrides,
  };
}

function buildWorkspaceDirectory(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    workspaces: [
      {
        id: 'workspace-1',
        name: 'Gravity',
        description: 'Main workspace',
        key: 'GRA',
        defaultProjectId: 'project-1',
        hostUrl: 'http://localhost:8080',
        joinMode: 'approval_required',
        projectCount: 1,
        memberCount: 1,
        pendingJoinRequestCount: 0,
        memberRole: 'owner',
      },
    ],
    loading: false,
    resolvedUserId: 'user-1',
    pendingAction: null,
    error: null,
    successMessage: null,
    refreshWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    requestJoinByInvite: vi.fn(),
    validatePeerInvite: vi.fn(),
    ...overrides,
  };
}

function buildAccountSettings(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    settings: {
      defaultView: 'board',
      theme: 'dark',
      projectLayout: 'standard',
      aiProvider: 'openai',
      apiKey: '',
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'llama3',
    },
    settingsLoading: false,
    saveLoading: false,
      resetProviderDraft: vi.fn(),
    saveSuccess: false,
    saveError: null,
    hasProviderChanges: false,
    testing: false,
    testResult: null,
    tutorialResult: null,
    ollamaModels: ['llama3'],
    ollamaModelsLoading: false,
    updateSettings: vi.fn(),
    saveSettings: vi.fn(),
    testApiKey: vi.fn(),
    resetTutorial: vi.fn(),
    refreshOllamaModels: vi.fn(),
    ...overrides,
  };
}

function buildWorkspaceSettings(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    settings: {
      hostUrl: 'http://localhost:8080',
      joinMode: 'approval_required',
      workspaceKey: 'ACCESS',
    },
    settingsLoading: false,
    saveLoading: false,
    saveSuccess: false,
    saveError: null,
    members: [],
    invites: [],
    invitesLoading: false,
    joinRequests: [],
    inviteLoading: false,
    inviteError: null,
    approveLoadingId: null,
    revokeLoadingId: null,
    deleteWorkspace: vi.fn(),
    deleteLoading: false,
    deleteError: null,
    clearDeleteError: vi.fn(),
    updateSettings: vi.fn(),
    saveSettings: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
    approveJoinRequest: vi.fn(),
    updateMemberActivity: vi.fn(),
    ...overrides,
  };
}

function renderAppShell({
  tickets = buildUseTickets(),
  directory = buildWorkspaceDirectory(),
  account = buildAccountSettings(),
  workspaceSettings = buildWorkspaceSettings(),
  initialEntries = ['/workspaces/workspace-1'],
  queryClient,
}: {
  tickets?: Record<string, unknown>;
  directory?: Record<string, unknown>;
  account?: Record<string, unknown>;
  workspaceSettings?: Record<string, unknown>;
  initialEntries?: string[];
  queryClient?: QueryClient;
} = {}) {
  const ticketState = tickets as any;
  mocks.useAuth.mockReturnValue({
    currentUser: ticketState.currentUser ?? null,
    loading: Boolean(ticketState.loading),
    isAuthenticated: Boolean(ticketState.currentUser),
    signOut: vi.fn(),
  });
  mocks.useUserDirectory.mockReturnValue({
    users: Array.isArray(ticketState.users) ? ticketState.users : [],
    isLoading: Boolean(ticketState.loading),
  });
  mocks.useActiveProject.mockReturnValue({
    activeProjectId: ticketState.activeProjectId || '',
    setActiveProjectId: ticketState.setActiveProjectId ?? vi.fn(),
    activeProjectIdRef: { current: ticketState.activeProjectId || '' },
  });
  const projects = Array.isArray(ticketState.projects) ? ticketState.projects : [];
  const projectById = new Map(projects.map((project: any) => [project.id, project]));
  const projectsByWorkspaceId = new Map<string, any[]>();
  for (const project of projects as any[]) {
    const workspaceProjects = projectsByWorkspaceId.get(project.workspaceId) || [];
    workspaceProjects.push(project);
    projectsByWorkspaceId.set(project.workspaceId, workspaceProjects);
  }
  mocks.useProjectContext.mockReturnValue({
    projects,
    projectsLoading: Boolean(ticketState.loading),
    projectLookup: new Map(),
    projectById,
    projectsByWorkspaceId,
    fetchInitialData: ticketState.fetchInitialData ?? vi.fn(),
    fetchProjectData: ticketState.fetchProjectData ?? vi.fn(),
    createProject: ticketState.createProject ?? vi.fn(),
    updateProject: ticketState.updateProject ?? vi.fn(),
    deleteProject: ticketState.deleteProject ?? vi.fn(),
    joinProject: ticketState.joinProject ?? vi.fn(),
  });
  mocks.useTicketListContext.mockReturnValue({
    tickets: Array.isArray(ticketState.tickets) ? ticketState.tickets : [],
    activeTicket: ticketState.activeTicket ?? null,
    setActiveTicket: ticketState.setActiveTicket ?? vi.fn(),
    ticketMap: ticketState.ticketMap ?? new Map(),
    ticketById: ticketState.ticketById ?? new Map(),
    ticketsByProject: ticketState.ticketsByProject ?? new Map(),
  });
  mocks.useCommentContext.mockReturnValue({
    addComment: ticketState.addComment ?? vi.fn(),
    updateComment: ticketState.updateComment ?? vi.fn(),
    deleteComment: ticketState.deleteComment ?? vi.fn(),
  });
  mocks.useTicketDetailContext.mockReturnValue({
    activeTicket: ticketState.activeTicket ?? null,
    setActiveTicket: ticketState.setActiveTicket ?? vi.fn(),
    activeTicketId: ticketState.activeTicket?.id ?? '',
    activeTicketProjectId: ticketState.activeTicket?.projectId || ticketState.activeProjectId || '',
    comments: ticketState.comments ?? [],
    activeTicketDetail: ticketState.activeTicketDetail ?? null,
  });
  mocks.useTicketRelationsContext.mockReturnValue({
    activeTicketDetail: ticketState.activeTicketDetail ?? null,
    addTicketDependency: ticketState.addTicketDependency ?? vi.fn(),
    removeTicketDependency: ticketState.removeTicketDependency ?? vi.fn(),
    addTicketBlocker: ticketState.addTicketBlocker ?? vi.fn(),
    removeTicketBlocker: ticketState.removeTicketBlocker ?? vi.fn(),
  });
  mocks.useTicketMutations.mockReturnValue(buildUseTicketMutations());
  mocks.useWorkspaceDirectory.mockReturnValue(directory);
  mocks.useAccountSettings.mockReturnValue(account);
  mocks.useWorkspaceSettings.mockReturnValue(workspaceSettings);
  mocks.useTicketFilters.mockReturnValue({
    filters: ticketState.filters,
    setFilters: ticketState.setFilters,
    resetFilters: vi.fn(),
  });
  mocks.useActiveView.mockReturnValue({
    activeView: ticketState.activeView,
    setView: ticketState.setView,
  });

  const appShellQueryClient = queryClient ?? sharedQueryClient;

  return render(
    <QueryClientProvider client={appShellQueryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <LocationDisplay />
        <Routes>
          <Route path="/" element={<AppShellPage />} />
          <Route path="/workspaces" element={<AppShellPage />} />
          <Route path="/workspaces/:workspaceId/projects" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/projects/:projectId/tickets/:ticketKey" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/projects/:projectId/tickets" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/projects/:projectId/notes" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/projects/:projectId/notes/:noteId" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/projects/list" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/all" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/teams" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/teams/:teamId/tasks" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/teams/:teamId/views/:viewId" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/teams/:teamId/cycles/:cycleId" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/teams/:teamId/labels/:labelId" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/teams/:teamId/projects" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/teams/:teamId/projects/:projectId/tickets" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId/teams/:teamId/projects/:projectId/tickets/:ticketKey" element={<WorkspaceShellPage />} />
          <Route path="/workspaces/:workspaceId" element={<WorkspaceShellPage />} />
          <Route path="*" element={<AppShellPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const aggregateProjects = [
  {
    id: 'project-1',
    name: 'Gravity Core',
    key: 'GRA',
    description: 'Primary project',
    status: 'active',
    workspaceId: 'workspace-1',
    teamId: 'team-1',
  },
  {
    id: 'project-2',
    name: 'Gravity API',
    key: 'API',
    description: 'API project',
    status: 'active',
    workspaceId: 'workspace-1',
    teamId: 'team-1',
  },
  {
    id: 'project-3',
    name: 'Design System',
    key: 'DSN',
    description: 'Design project',
    status: 'active',
    workspaceId: 'workspace-1',
    teamId: 'team-2',
  },
];

const aggregateSidebarTree = {
  workspaceId: 'workspace-1',
  hierarchyMode: 'teams',
  teams: [
    {
      id: 'team-1',
      name: 'Engineering',
      description: '',
      color: '#2563eb',
      views: [
        { id: 'all', name: 'All Tasks', type: 'all' },
        { id: 'timeline', name: 'Timeline', type: 'timeline' },
      ],
      cycles: [],
      labels: [],
      projects: aggregateProjects.slice(0, 2),
    },
    {
      id: 'team-2',
      name: 'Design',
      description: '',
      color: '#f97316',
      views: [
        { id: 'all', name: 'All Tasks', type: 'all' },
        { id: 'timeline', name: 'Timeline', type: 'timeline' },
      ],
      cycles: [],
      labels: [],
      projects: aggregateProjects.slice(2),
    },
  ],
};

const teamAggregateTickets = [
  {
    id: 'ticket-1',
    key: 'GRA-1',
    title: 'Team task one',
    status: 'todo',
    priority: 'medium',
    projectId: 'project-1',
    assigneeId: null,
    cycleId: null,
    parentId: null,
    prStatus: 'none',
    prUrl: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
  },
  {
    id: 'ticket-2',
    key: 'API-1',
    title: 'Team task two',
    status: 'in_progress',
    priority: 'high',
    projectId: 'project-2',
    assigneeId: null,
    cycleId: null,
    parentId: null,
    prStatus: 'none',
    prUrl: null,
    createdAt: '2026-06-02T10:00:00.000Z',
    updatedAt: '2026-06-02T10:00:00.000Z',
  },
];

const workspaceAggregateTickets = [
  ...teamAggregateTickets,
  {
    id: 'ticket-3',
    key: 'DSN-1',
    title: 'Workspace task from another team',
    status: 'backlog',
    priority: 'low',
    projectId: 'project-3',
    assigneeId: null,
    cycleId: null,
    parentId: null,
    prStatus: 'none',
    prUrl: null,
    createdAt: '2026-06-03T10:00:00.000Z',
    updatedAt: '2026-06-03T10:00:00.000Z',
  },
];

function mockAggregateApiResponses() {
  mocks.fetch.mockImplementation((input: RequestInfo | URL) => {
    const inputUrl = typeof input === 'string' ? input : input.toString();
    const parsedUrl = inputUrl.startsWith('http')
      ? new URL(inputUrl)
      : new URL(inputUrl, 'http://localhost');

    if (parsedUrl.pathname === '/api/v1/workspaces/workspace-1/sidebar') {
      return Promise.resolve(jsonResponse(aggregateSidebarTree));
    }

    if (parsedUrl.pathname === '/api/v1/tickets') {
      const teamId = parsedUrl.searchParams.get('teamId');
      const workspaceId = parsedUrl.searchParams.get('workspaceId');

      if (teamId === 'team-1') {
        return Promise.resolve(jsonResponse(teamAggregateTickets));
      }

      if (workspaceId === 'workspace-1') {
        return Promise.resolve(jsonResponse(workspaceAggregateTickets));
      }
    }

    if (
      (parsedUrl.pathname === '/api/v1/cycles' && parsedUrl.searchParams.get('teamId') === 'team-1')
      || (parsedUrl.pathname === '/api/v1/labels' && parsedUrl.searchParams.get('teamId') === 'team-1')
    ) {
      return Promise.resolve(jsonResponse([]));
    }

    if (parsedUrl.pathname === '/api/v1/settings/user-1') {
      return Promise.resolve(jsonResponse({
        defaultView: 'board',
        theme: 'dark',
        tutorialCompleted: true
      }));
    }

    return Promise.resolve(jsonResponse({ success: true, lastActiveAt: '2026-05-26T10:00:00.000Z' }));
  });
}

describe('AppShellPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (navigator as any).modelContext;
    window.localStorage.clear();
    sharedQueryClient.clear();
    mocks.fetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: true, lastActiveAt: '2026-05-26T10:00:00.000Z' }))
    );
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the auth screen when no current user is available', () => {
    renderAppShell({
      tickets: buildUseTickets({ currentUser: null }),
      directory: buildWorkspaceDirectory({ resolvedUserId: null }),
    });

    expect(screen.getByText('AuthScreen')).toBeInTheDocument();
  });

  it('renders the loading page while ticket or workspace data is still resolving', () => {
    renderAppShell({
      tickets: buildUseTickets({ loading: true }),
    });

    expect(screen.getByText('LoadingPage')).toBeInTheDocument();
  });

  it('renders the loading page while account settings are still hydrating', () => {
    renderAppShell({
      account: buildAccountSettings({
        settingsHydrated: false,
      }),
    });

    expect(screen.getByText('LoadingPage')).toBeInTheDocument();
    expect(screen.queryByText('WorkspaceLayout')).not.toBeInTheDocument();
  });

  it('routes signed-in users without workspaces to the directory page', async () => {
    renderAppShell({
      directory: buildWorkspaceDirectory({ workspaces: [] }),
      initialEntries: ['/workspaces'],
    });

    await waitFor(() => {
      expect(screen.getByText('WorkspaceDirectoryPage')).toBeInTheDocument();
    });
  });

  it('renders onboarding for incomplete tutorials and sets it complete when dismissed', async () => {
    mocks.fetch.mockImplementation((input: RequestInfo | URL) => {
      const inputUrl = typeof input === 'string' ? input : input.toString();
      if (inputUrl.includes('/api/v1/settings/')) {
        return Promise.resolve(jsonResponse({ tutorialCompleted: false }));
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    const user = userEvent.setup();
    const tickets = buildUseTickets({
      currentUser: makeCurrentUser(),
    });

    renderAppShell({ tickets, initialEntries: ['/workspaces'] });

    await waitFor(() => {
      expect(screen.getByText('OnboardingModal')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Complete onboarding' }));
    
    // Assert that the PATCH request was sent
    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tutorial'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ completed: true }),
      })
      );
    });
  });

  it('keeps onboarding hidden in the workspace shell when the persisted tutorial is complete', async () => {
    renderAppShell({
      tickets: buildUseTickets({
        currentUser: makeCurrentUser({ tutorial_completed: 0 }),
      }),
      account: buildAccountSettings({
        settings: {
          defaultView: 'board',
          theme: 'dark',
          projectLayout: 'standard',
          aiProvider: 'openai',
          apiKey: '',
          ollamaEndpoint: 'http://localhost:11434',
          ollamaModel: 'llama3',
          tutorialCompleted: true,
        },
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('WorkspaceLayout')).toBeInTheDocument();
    });

    expect(screen.queryByText('OnboardingModal')).not.toBeInTheDocument();
  });

  it('ignores the create-ticket shortcut while typing in an input', async () => {
    const user = userEvent.setup();

    renderAppShell();

    await waitFor(() => {
      expect(screen.getByText('WorkspaceLayout')).toBeInTheDocument();
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    await user.keyboard('n');

    expect(screen.queryByText('CreateTicketModal')).not.toBeInTheDocument();
    input.remove();
  });

  it('renders workspace routes and switches between workspace, settings, account, and projects', async () => {
    const user = userEvent.setup();

    const firstRender = renderAppShell();

    await waitFor(() => {
      expect(screen.getByText('WorkspaceLayout')).toBeInTheDocument();
      expect(screen.getByText('WorkspacePage')).toBeInTheDocument();
    });

    await user.keyboard('n');
    expect(screen.getByText('CreateTicketModal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe('/workspaces/workspace-1/settings');
    });

    firstRender.unmount();

    const secondRender = renderAppShell();

    await waitFor(() => {
      expect(screen.getByText('WorkspaceLayout')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Open account preferences' }));
    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe('/account');
    });

    secondRender.unmount();

    const thirdRender = renderAppShell();

    await waitFor(() => {
      expect(screen.getByText('WorkspaceLayout')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Open project manager' }));
    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe('/workspaces/workspace-1/projects');
    });

    thirdRender.unmount();
  });

  it('switches to the workspace projects list when the workspace Projects tab is selected', async () => {
    const user = userEvent.setup();

    renderAppShell();

    await waitFor(() => {
      expect(screen.getByText('WorkspaceLayout')).toBeInTheDocument();
      expect(screen.getByText('WorkspacePage')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open workspace projects' }));

    await waitFor(() => {
      expect(screen.getByText('WorkspaceProjectsListPage')).toBeInTheDocument();
    });

    expect(screen.getByTestId('location-display').textContent).toBe('/workspaces/workspace-1/projects/list');
  });

  it('mounts ticket actions for issue routes but not management routes without WebMCP support', async () => {
    const user = userEvent.setup();

    renderAppShell();

    await waitFor(() => {
      expect(screen.getByText('WorkspacePage')).toBeInTheDocument();
    });
    expect(screen.getByTestId('workspace-ticket-action-provider')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open workspace projects' }));

    await waitFor(() => {
      expect(screen.getByText('WorkspaceProjectsListPage')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('workspace-ticket-action-provider')).not.toBeInTheDocument();
  });

  it('keeps the WebMCP action bridge available on management routes when native WebMCP is supported', async () => {
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      value: {
        registerTool: vi.fn(),
      },
    });

    renderAppShell({
      initialEntries: ['/workspaces/workspace-1/projects/list'],
    });

    await waitFor(() => {
      expect(screen.getByText('WorkspaceProjectsListPage')).toBeInTheDocument();
    });

    expect(screen.getByTestId('workspace-ticket-action-provider')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.registerWebMCPTools).toHaveBeenCalled();
    });
  });

  it('routes Manage Teams to the dedicated team manager for team workspace owners', async () => {
    const user = userEvent.setup();

    renderAppShell({
      directory: buildWorkspaceDirectory({
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Gravity',
            description: 'Main workspace',
            key: 'GRA',
            defaultProjectId: 'project-1',
            hostUrl: 'http://localhost:8080',
            joinMode: 'approval_required',
            hierarchyMode: 'teams',
            projectCount: 1,
            memberCount: 1,
            pendingJoinRequestCount: 0,
            memberRole: 'owner',
          },
        ],
      }),
    });

    await waitFor(() => {
      const menuState = screen.getByTestId('workspace-management-menu-state');
      expect(menuState).toHaveTextContent('Manage Teams');
      expect(menuState).toHaveAttribute('data-visible', 'true');
    });

    await user.click(screen.getByRole('button', { name: 'Open project manager' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe('/workspaces/workspace-1/teams');
      expect(screen.getByText('WorkspaceTeamsPage')).toBeInTheDocument();
    });
  });

  it('routes team project management to the dedicated team projects page', async () => {
    mockAggregateApiResponses();

    renderAppShell({
      tickets: buildUseTickets({
        projects: aggregateProjects,
        activeProjectId: 'project-1',
      }),
      directory: buildWorkspaceDirectory({
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Gravity',
            description: 'Main workspace',
            key: 'GRA',
            defaultProjectId: 'project-1',
            hostUrl: 'http://localhost:8080',
            joinMode: 'approval_required',
            hierarchyMode: 'teams',
            projectCount: 3,
            memberCount: 1,
            pendingJoinRequestCount: 0,
            memberRole: 'owner',
          },
        ],
      }),
      initialEntries: ['/workspaces/workspace-1/teams/team-1/projects'],
    });

    await waitFor(() => {
      expect(screen.getByText('Manage Team Projects')).toBeInTheDocument();
      expect(screen.getByTestId('location-display').textContent).toBe('/workspaces/workspace-1/teams/team-1/projects');
    });
  });

  it('hides workspace management in team workspaces for non-owners', async () => {
    const currentUser = makeCurrentUser({ role: 'member' });

    renderAppShell({
      tickets: buildUseTickets({ currentUser }),
      directory: buildWorkspaceDirectory({
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Gravity',
            description: 'Main workspace',
            key: 'GRA',
            defaultProjectId: 'project-1',
            hostUrl: 'http://localhost:8080',
            joinMode: 'approval_required',
            hierarchyMode: 'teams',
            projectCount: 1,
            memberCount: 1,
            pendingJoinRequestCount: 0,
            memberRole: 'member',
          },
        ],
      }),
    });

    await waitFor(() => {
      const menuState = screen.getByTestId('workspace-management-menu-state');
      expect(menuState).toHaveTextContent('Manage Teams');
      expect(menuState).toHaveAttribute('data-visible', 'false');
    });
  });

  it('does not open the create-ticket modal when the active workspace has no projects', async () => {
    const user = userEvent.setup();

    renderAppShell({
      tickets: buildUseTickets({ projects: [] }),
    });

    await waitFor(() => {
      expect(screen.getByText('WorkspaceLayout')).toBeInTheDocument();
      expect(screen.getByText('WorkspacePage')).toBeInTheDocument();
    });

    await user.keyboard('n');

    expect(screen.queryByText('CreateTicketModal')).not.toBeInTheDocument();
  });

  it('shows cached workspace labels in Manage Projects even when the ticket context label list is empty', async () => {
    sharedQueryClient.setQueryData(queryKeys.labels('project-1'), [
      {
        id: 'label-1',
        projectId: 'project-1',
        name: 'Frontend',
        color: '#2563eb',
        description: 'UI work',
        sortOrder: 0,
      },
    ]);
    sharedQueryClient.setQueryData(queryKeys.labels('project-2'), [
      {
        id: 'label-2',
        projectId: 'project-2',
        name: 'Payments',
        color: '#10b981',
        description: 'Billing work',
        sortOrder: 0,
      },
    ]);

    renderAppShell({
      tickets: buildUseTickets({
        activeProjectId: 'project-1',
        labels: [],
        projects: [
          {
            id: 'project-1',
            name: 'Gravity Core',
            key: 'GRA',
            description: 'Primary project',
            status: 'active',
            workspaceId: 'workspace-1',
          },
          {
            id: 'project-2',
            name: 'Gravity API',
            key: 'API',
            description: 'API project',
            status: 'planned',
            workspaceId: 'workspace-1',
          },
        ],
      }),
      initialEntries: ['/workspaces/workspace-1/projects'],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Frontend' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Payments' })).not.toBeInTheDocument();
  });

  it('builds project sidebar counts from exact per-project ticket cache entries', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const getQueriesData = vi.spyOn(queryClient, 'getQueriesData');
    const getQueryData = vi.spyOn(queryClient, 'getQueryData');
    const hasTicketQueryProjectId = (queryKey: unknown, projectId: string) => {
      if (!Array.isArray(queryKey) || queryKey[0] !== 'tickets' || typeof queryKey[1] !== 'object' || !queryKey[1]) {
        return false;
      }
      return (queryKey[1] as { projectId?: string }).projectId === projectId;
    };

    queryClient.setQueryData(queryKeys.tickets('project-1'), [
      {
        id: 'ticket-1',
        key: 'GRA-1',
        title: 'Frontend ticket',
        status: 'todo',
        priority: 'medium',
        projectId: 'project-1',
        assigneeId: 'user-1',
        cycleId: 'cycle-1',
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'ticket-2',
        title: 'Archived ticket',
        key: 'GRA-2',
        status: 'done',
        priority: 'low',
        projectId: 'project-1',
        assigneeId: 'user-1',
        cycleId: 'cycle-2',
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'ticket-3',
        title: 'In progress ticket',
        key: 'GRA-3',
        status: 'in_progress',
        priority: 'high',
        projectId: 'project-1',
        assigneeId: null,
        cycleId: null,
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ]);
    queryClient.setQueryData(queryKeys.tickets('project-2'), [
      {
        id: 'ticket-4',
        title: 'Api backlog ticket',
        key: 'API-1',
        status: 'backlog',
        priority: 'low',
        projectId: 'project-2',
        assigneeId: null,
        cycleId: 'cycle-1',
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      },
    ]);
    queryClient.setQueryData(queryKeys.tickets('other-project'), [
      {
        id: 'ticket-other',
        title: 'Other workspace ticket',
        key: 'OTH-1',
        status: 'todo',
        priority: 'medium',
        projectId: 'other-project',
        assigneeId: 'user-1',
        cycleId: null,
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-03T00:00:00.000Z',
        updatedAt: '2026-05-03T00:00:00.000Z',
      },
    ]);

    renderAppShell({
      tickets: buildUseTickets({
        activeProjectId: 'project-1',
        projects: [
          {
            id: 'project-1',
            name: 'Gravity Core',
            key: 'GRA',
            description: 'Primary project',
            status: 'active',
            workspaceId: 'workspace-1',
          },
          {
            id: 'project-2',
            name: 'Gravity API',
            key: 'API',
            description: 'API project',
            status: 'planned',
            workspaceId: 'workspace-1',
          },
        ],
        activeView: 'list',
      }),
      initialEntries: ['/workspaces/workspace-1'],
      queryClient,
    });

    await waitFor(() => {
      expect(screen.getByTestId('sidebar-counts-by-project')).toBeInTheDocument();
    });

    const projectCounts = JSON.parse(
      screen.getByTestId('sidebar-counts-by-project').textContent || '{}'
    ) as Record<
      string,
      { myIssues: number; activeProjectIssues: number; labels: Record<string, number>; cycles: Record<string, number> }
    >;

    expect(projectCounts).toEqual({
      'project-1': {
        myIssues: 1,
        activeProjectIssues: 2,
        labels: {},
        cycles: { 'cycle-1': 1 },
      },
      'project-2': {
        myIssues: 0,
        activeProjectIssues: 1,
        labels: {},
        cycles: { 'cycle-1': 1 },
      },
    });
    expect(
      getQueriesData.mock.calls.some(([queryFilter]: unknown[]) => {
        if (!queryFilter || typeof queryFilter !== 'object' || !('queryKey' in queryFilter)) {
          return false;
        }
        const queryKey = (queryFilter as { queryKey?: unknown[] }).queryKey;
        return Array.isArray(queryKey) && (queryKey[0] === 'tickets' || queryKey[0] === 'labels');
      })
    ).toBe(false);
    expect(
      getQueryData.mock.calls.some(([queryKey]) => hasTicketQueryProjectId(queryKey, 'other-project'))
    ).toBe(false);
    expect(
      getQueryData.mock.calls.some(([queryKey]) => hasTicketQueryProjectId(queryKey, 'project-1'))
    ).toBe(true);
    expect(
      getQueryData.mock.calls.some(([queryKey]) => hasTicketQueryProjectId(queryKey, 'project-2'))
    ).toBe(true);
  });

  it('recomputes project sidebar counts when per-project ticket cache entries change', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const activeProjectTicket = {
      id: 'ticket-1',
      key: 'GRA-1',
      title: 'Active project ticket',
      status: 'todo',
      priority: 'medium',
      projectId: 'project-1',
      assigneeId: 'user-1',
      cycleId: 'cycle-1',
      parentId: null,
      prStatus: 'none',
      prUrl: null,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    };

    queryClient.setQueryData(queryKeys.tickets('project-1'), [activeProjectTicket]);
    queryClient.setQueryData(queryKeys.tickets('project-2'), [
      {
        id: 'ticket-2',
        key: 'API-1',
        title: 'Team backlog',
        status: 'in_progress',
        priority: 'low',
        projectId: 'project-2',
        assigneeId: null,
        cycleId: null,
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      },
    ]);

    renderAppShell({
      tickets: buildUseTickets({
        activeProjectId: 'project-1',
        projects: [
          {
            id: 'project-1',
            name: 'Gravity Core',
            key: 'GRA',
            description: 'Primary project',
            status: 'active',
            workspaceId: 'workspace-1',
          },
          {
            id: 'project-2',
            name: 'Gravity API',
            key: 'API',
            description: 'API project',
            status: 'planned',
            workspaceId: 'workspace-1',
          },
        ],
        activeView: 'list',
      }),
      initialEntries: ['/workspaces/workspace-1'],
      queryClient,
    });

    await waitFor(() => {
      expect(screen.getByTestId('sidebar-counts-by-project')).toBeInTheDocument();
    });

    const parseCounts = () =>
      JSON.parse(screen.getByTestId('sidebar-counts-by-project').textContent || '{}') as Record<
        string,
        { myIssues: number; activeProjectIssues: number; labels: Record<string, number>; cycles: Record<string, number> }
      >;

    expect(parseCounts()).toMatchObject({
      'project-1': {
        myIssues: 1,
        activeProjectIssues: 1,
      },
      'project-2': {
        myIssues: 0,
        activeProjectIssues: 1,
      },
    });

    queryClient.setQueryData(queryKeys.tickets('project-1'), [
      activeProjectTicket,
      {
        id: 'ticket-3',
        key: 'GRA-2',
        title: 'Second ticket',
        status: 'in_progress',
        priority: 'low',
        projectId: 'project-1',
        assigneeId: null,
        cycleId: null,
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-03T00:00:00.000Z',
        updatedAt: '2026-05-03T00:00:00.000Z',
      },
    ]);

    await waitFor(() => {
      expect(parseCounts()['project-1'].activeProjectIssues).toBe(2);
    });
  });

  it('uses project-scoped sidebar labels in Manage Projects before per-project label prefetches resolve', async () => {
    const user = userEvent.setup();

    mocks.fetch.mockImplementation((input: RequestInfo | URL) => {
      const inputUrl = typeof input === 'string' ? input : input.toString();
      const parsedUrl = inputUrl.startsWith('http')
        ? new URL(inputUrl)
        : new URL(inputUrl, 'http://localhost');

      if (parsedUrl.pathname === '/api/v1/workspaces/workspace-1/sidebar') {
        return Promise.resolve(jsonResponse({
          workspaceId: 'workspace-1',
          hierarchyMode: 'flat',
          teams: [
            {
              id: 'team-1',
              name: 'Default',
              description: '',
              color: '#2563eb',
              views: [],
              cycles: [],
              labels: [
                {
                  id: 'label-1',
                  projectId: 'project-1',
                  name: 'Frontend',
                  color: '#2563eb',
                  description: 'UI work',
                  sortOrder: 0,
                },
                {
                  id: 'label-2',
                  projectId: 'project-2',
                  name: 'Payments',
                  color: '#10b981',
                  description: 'Billing work',
                  sortOrder: 0,
                },
              ],
              projects: [
                {
                  id: 'project-1',
                  name: 'Gravity Core',
                  key: 'GRA',
                  description: 'Primary project',
                  status: 'active',
                  githubRepoUrl: null,
                },
                {
                  id: 'project-2',
                  name: 'Gravity API',
                  key: 'API',
                  description: 'API project',
                  status: 'planned',
                  githubRepoUrl: null,
                },
              ],
            },
          ],
        }));
      }

      if (parsedUrl.pathname === '/api/v1/labels') {
        return new Promise<Response>(() => {});
      }

      return Promise.resolve(jsonResponse({ success: true, lastActiveAt: '2026-05-26T10:00:00.000Z' }));
    });

    renderAppShell({
      tickets: buildUseTickets({
        activeProjectId: 'project-1',
        labels: [],
        projects: [
          {
            id: 'project-1',
            name: 'Gravity Core',
            key: 'GRA',
            description: 'Primary project',
            status: 'active',
            workspaceId: 'workspace-1',
            teamId: 'team-1',
          },
          {
            id: 'project-2',
            name: 'Gravity API',
            key: 'API',
            description: 'API project',
            status: 'planned',
            workspaceId: 'workspace-1',
            teamId: 'team-1',
          },
        ],
      }),
      directory: buildWorkspaceDirectory({
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Gravity',
            description: 'Main workspace',
            key: 'GRA',
            defaultProjectId: 'project-1',
            hostUrl: 'http://localhost:8080',
            joinMode: 'approval_required',
            projectCount: 2,
            memberCount: 1,
            pendingJoinRequestCount: 0,
            memberRole: 'owner',
            hierarchyMode: 'flat',
          },
        ],
      }),
      initialEntries: ['/workspaces/workspace-1/projects'],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Frontend' })).toBeInTheDocument();
    });
    await waitFor(() => {
      const prefetchedProjectIds = new Set(
        mocks.fetch.mock.calls
          .map(([input]) => {
            const inputUrl = typeof input === 'string' ? input : input.toString();
            const parsedUrl = inputUrl.startsWith('http')
              ? new URL(inputUrl)
              : new URL(inputUrl, 'http://localhost');
            return parsedUrl.pathname === '/api/v1/labels' ? parsedUrl.searchParams.get('projectId') : null;
          })
          .filter(Boolean)
      );
      expect(prefetchedProjectIds).toEqual(new Set(['project-1', 'project-2']));
    });
    expect(screen.queryByRole('button', { name: 'Payments' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Gravity API/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Payments' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Frontend' })).not.toBeInTheDocument();
  });

  it('records member activity for the active workspace', async () => {
    renderAppShell();

    await waitFor(() => {
      const hasActivityCall = mocks.fetch.mock.calls.some(([input, init]) => {
        const inputUrl = typeof input === 'string' ? input : input.toString();
        return (
          inputUrl === '/api/v1/workspaces/workspace-1/members/user-1/activity'
          && init?.method === 'POST'
          && init?.headers?.['X-User-Id'] === 'user-1'
        );
      });
      expect(hasActivityCall).toBe(true);
    });
  });

  it('navigates to label-filtered URL when a label is selected (GRAV-113)', async () => {
    const user = userEvent.setup();

    renderAppShell({
      tickets: buildUseTickets({
        activeTicket: { id: 't-1' },
        labels: [{ id: 'd-1', projectId: 'project-1', name: 'Frontend', color: '#fff', description: '', sortOrder: 0 }],
        activeProjectId: 'project-1',
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('WorkspaceLayout')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Select label' }));

    // Verify that navigate() was called with the correct label-filtered URL.
    // The URL change drives the sync effect which then updates filters + closes the ticket detail.
    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe(
        '/workspaces/workspace-1/projects/project-1/tickets?labels=d-1'
      );
    });
  });

  it('navigates to a note detail URL when a note is selected', async () => {
    const user = userEvent.setup();

    renderAppShell();

    await waitFor(() => {
      expect(screen.getByText('WorkspacePage')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open note' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe(
        '/workspaces/workspace-1/projects/project-1/notes/note-1'
      );
    });
  });

  it('seeds the active ticket before navigating to a ticket detail URL', async () => {
    const user = userEvent.setup();
    const setActiveTicket = vi.fn();
    const ticket = {
      id: 'ticket-1',
      key: 'GRA-101',
      title: 'Investigate detail panel',
      projectId: 'project-1',
      status: 'todo',
      priority: 'medium',
      assigneeId: null,
      labelIds: [],
      cycleId: null,
      parentId: null,
      prStatus: 'none',
      prUrl: null,
      createdAt: '2026-06-04T10:00:00.000Z',
      updatedAt: '2026-06-04T10:00:00.000Z',
    };

    renderAppShell({
      tickets: buildUseTickets({
        tickets: [ticket],
        setActiveTicket,
      }),
      initialEntries: ['/workspaces/workspace-1/projects/project-1/tickets'],
    });

    await waitFor(() => {
      expect(screen.getByText('WorkspacePage')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open first ticket' }));

    expect(setActiveTicket).toHaveBeenCalledWith(ticket);
    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe(
        '/workspaces/workspace-1/projects/project-1/tickets/GRA-101'
      );
    });
  });

  it('renders team All Tasks using the active board/list preference across team projects', async () => {
    mockAggregateApiResponses();

    renderAppShell({
      tickets: buildUseTickets({
        activeView: 'board',
        projects: aggregateProjects,
        tickets: [],
      }),
      initialEntries: ['/workspaces/workspace-1/teams/team-1/tasks'],
    });

    await waitFor(() => {
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-active-view', 'board');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-view-mode-locked', 'false');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-project-count', '2');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-project-filter', '');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-ticket-count', '2');
    });
  });

  it('does not special-case team Board routes and keeps Timeline as a locked aggregate view', async () => {
    mockAggregateApiResponses();

    const boardRender = renderAppShell({
      tickets: buildUseTickets({
        activeView: 'list',
        projects: aggregateProjects,
        tickets: [],
      }),
      initialEntries: ['/workspaces/workspace-1/teams/team-1/views/board'],
    });

    await waitFor(() => {
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-active-view', 'list');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-view-mode-locked', 'false');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-ticket-count', '2');
    });

    boardRender.unmount();
    mockAggregateApiResponses();

    renderAppShell({
      tickets: buildUseTickets({
        activeView: 'board',
        projects: aggregateProjects,
        tickets: [],
      }),
      initialEntries: ['/workspaces/workspace-1/teams/team-1/views/timeline'],
    });

    await waitFor(() => {
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-active-view', 'timeline');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-view-mode-locked', 'true');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-ticket-count', '2');
    });
  });

  it('renders workspace All Tasks using the active board/list preference across all teams', async () => {
    mockAggregateApiResponses();

    renderAppShell({
      tickets: buildUseTickets({
        activeView: 'list',
        projects: aggregateProjects,
        tickets: [],
      }),
      initialEntries: ['/workspaces/workspace-1/all'],
    });

    await waitFor(() => {
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-active-view', 'list');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-view-mode-locked', 'false');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-project-count', '3');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-project-filter', '');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-ticket-count', '3');
    });
  });

  it('keeps team project routes on project-scoped tickets instead of team aggregate tickets', async () => {
    mockAggregateApiResponses();

    renderAppShell({
      tickets: buildUseTickets({
        activeView: 'board',
        projects: aggregateProjects,
        tickets: [
          {
            id: 'ticket-project-only',
            key: 'GRA-9',
            title: 'Project scoped task',
            status: 'todo',
            priority: 'medium',
            projectId: 'project-1',
            assigneeId: null,
            cycleId: null,
            parentId: null,
            prStatus: 'none',
            prUrl: null,
            createdAt: '2026-06-04T10:00:00.000Z',
            updatedAt: '2026-06-04T10:00:00.000Z',
          },
        ],
      }),
      initialEntries: ['/workspaces/workspace-1/teams/team-1/projects/project-1/tickets'],
    });

    await waitFor(() => {
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-active-view', 'board');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-view-mode-locked', 'false');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-project-count', '2');
      expect(screen.getByTestId('workspace-page-state')).toHaveAttribute('data-ticket-count', '1');
    });
  });

  it('returns to the ticket list URL after deleting the active ticket', async () => {
    const user = userEvent.setup();
    const activeTicket = {
      id: 't-1',
      key: 'TST-1',
      title: 'Delete me',
      projectId: 'project-1',
    };

    renderAppShell({
      tickets: buildUseTickets({
        activeTicket,
        tickets: [activeTicket],
      }),
      initialEntries: ['/workspaces/workspace-1/projects/project-1/tickets/TST-1'],
    });

    await waitFor(() => {
      expect(screen.getByText('TicketDetailRoute Mock')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Delete active ticket' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe(
        '/workspaces/workspace-1/projects/project-1/tickets'
      );
    });
  });

  it('forces activeView to list mode and triggers setView when resizing to a mobile viewport', async () => {
    const setView = vi.fn();
    
    // Stub window.innerWidth
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    renderAppShell({
      tickets: buildUseTickets({
        activeView: 'board',
        setView,
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('WorkspaceLayout')).toBeInTheDocument();
    });

    // Resize to mobile
    window.innerWidth = 500;
    window.dispatchEvent(new Event('resize'));

    await waitFor(() => {
      expect(setView).toHaveBeenCalledWith('list');
    });

    // Restore window.innerWidth
    window.innerWidth = originalInnerWidth;
  });

  it('routes to teams page with create=true flag when onOpenCreateTeam is called', async () => {
    const user = userEvent.setup();

    renderAppShell({
      directory: buildWorkspaceDirectory({
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Gravity',
            description: 'Main workspace',
            key: 'GRA',
            defaultProjectId: 'project-1',
            hostUrl: 'http://localhost:8080',
            joinMode: 'approval_required',
            hierarchyMode: 'teams',
            projectCount: 1,
            memberCount: 1,
            pendingJoinRequestCount: 0,
            memberRole: 'owner',
          },
        ],
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('WorkspaceLayout')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open create team' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe('/workspaces/workspace-1/teams?create=true');
    });
  });
});
