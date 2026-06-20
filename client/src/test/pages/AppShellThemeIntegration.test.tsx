import type { ReactNode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider as AppThemeProvider } from '../../context/theme/ThemeContext';
import { ThemeProvider as SettingsThemeProvider } from '../../modules/settings';
import { AppShellPage } from '../../pages/AppShellPage/AppShellPage.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  useTickets: vi.fn(),
  useActiveProject: vi.fn(),
  useProjectContext: vi.fn(),
  useTicketDetailContext: vi.fn(),
  useTicketMutations: vi.fn(),
  useWorkspaceDirectory: vi.fn(),
  useAccountSettings: vi.fn(),
  useWorkspaceSettings: vi.fn(),
  useTicketFilters: vi.fn(),
  useActiveView: vi.fn(),
  registerWebMCPTools: vi.fn(() => null),
}));

vi.mock('../../context/TicketContextContext', () => ({
  useTickets: mocks.useTickets,
}));

vi.mock('../../context/project/ActiveProjectContext', () => ({
  useActiveProject: mocks.useActiveProject,
}));

vi.mock('../../context/project/ProjectContext', () => ({
  useProjectContext: mocks.useProjectContext,
}));

vi.mock('../../context/ticket/TicketDetailContext', () => ({
  useTicketDetailContext: mocks.useTicketDetailContext,
}));

vi.mock('../../context/ticket/TicketMutationContext', () => ({
  useTicketMutations: mocks.useTicketMutations,
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

vi.mock('../../utils/webmcp', () => ({
  registerWebMCPTools: mocks.registerWebMCPTools,
}));

vi.mock('../../modules/auth', () => ({
  AuthScreen: () => <div>AuthScreen</div>,
}));

vi.mock('../../modules/tickets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../modules/tickets')>();
  return {
    ...actual,
  CreateTicketModal: () => <div>CreateTicketModal</div>,
  };
});

vi.mock('../../modules/ai', () => ({
  AgentSimulator: () => <div>AgentSimulator</div>,
  LocalAIChat: () => <div>LocalAIChat</div>,
}));

vi.mock('../../modules/onboarding', () => ({
  OnboardingModal: () => <div>OnboardingModal</div>,
}));

vi.mock('../../layouts/WorkspaceLayout/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children, rightPanels }: { children?: ReactNode; rightPanels?: ReactNode }) => (
    <div>
      <div>WorkspaceLayout</div>
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
  WorkspacePage: () => <div>WorkspacePage</div>,
}));

vi.mock('../../modules/workspaceProjectsListPage', () => ({
  WorkspaceProjectsListPage: () => <div>WorkspaceProjectsListPage</div>,
}));

vi.mock('../../modules/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../modules/settings')>();
  return {
    ...actual,
    SettingsScreen: () => <div>SettingsPage</div>,
  };
});

vi.mock('../../pages/AccountPreferencesPage/AccountPreferencesPage', () => ({
  AccountPreferencesPage: () => <div>AccountPreferencesPage</div>,
}));

function makeCurrentUser() {
  return {
    id: 'user-1',
    name: 'Casey Carter',
    email: 'casey@example.com',
    avatar: '',
    role: 'owner',
    tutorial_completed: 1,
  };
}

function buildUseTickets(overrides: Partial<Record<string, unknown>> = {}) {
  const currentUser = makeCurrentUser();

  return {
    activeProjectId: 'project-1',
    activeTicket: null,
    activeView: 'board',
    addComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    comments: [],
    createDomain: vi.fn(),
    createProject: vi.fn(),
    createTicket: vi.fn(),
    currentUser,
    cycles: [],
    deleteTicket: vi.fn(),
    domains: [],
    fetchInitialData: vi.fn(),
    filters: {
      search: '',
      priority: '',
      status: '',
      projectId: '',
      domainId: '',
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
    signOut: vi.fn(),
    theme: 'dark',
    tickets: [],
    updateTicket: vi.fn(),
    users: [currentUser],
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
      theme: 'marble-blue',
      projectLayout: 'condensed',
      aiProvider: 'openai',
      apiKey: '',
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'llama3',
      agentIntegration: 'ollama',
    },
    settingsLoading: false,
      resetProviderDraft: vi.fn(),
    saveLoading: false,
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
    federationConnections: [],
    connectionsLoading: false,
    connectionsError: null,
    retryingConnectionId: null,
    approveLoadingId: null,
    revokeLoadingId: null,
    updateSettings: vi.fn(),
    saveSettings: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
    approveJoinRequest: vi.fn(),
    retryFederationConnection: vi.fn(),
    deleteWorkspace: vi.fn(),
    deleteLoading: false,
    deleteError: null,
    clearDeleteError: vi.fn(),
    updateMemberActivity: vi.fn(),
    ...overrides,
  };
}

function renderAppShell() {
  mocks.useWorkspaceDirectory.mockReturnValue(buildWorkspaceDirectory());
  mocks.useAccountSettings.mockReturnValue(buildAccountSettings());
  mocks.useWorkspaceSettings.mockReturnValue(buildWorkspaceSettings());
  
  const tickets = buildUseTickets();
  mocks.useTickets.mockReturnValue(tickets);
  const ticketState = tickets as any;
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
  mocks.useTicketDetailContext.mockReturnValue({
    activeTicket: ticketState.activeTicket ?? null,
    setActiveTicket: ticketState.setActiveTicket ?? vi.fn(),
    activeTicketId: ticketState.activeTicket?.id ?? '',
    activeTicketProjectId: ticketState.activeTicket?.projectId || ticketState.activeProjectId || '',
    comments: ticketState.comments ?? [],
    activeTicketDetail: ticketState.activeTicketDetail ?? null,
  });
  mocks.useTicketMutations.mockReturnValue(buildUseTicketMutations());
  mocks.useTicketFilters.mockReturnValue({
    filters: ticketState.filters,
    setFilters: ticketState.setFilters,
    resetFilters: vi.fn(),
  });
  mocks.useActiveView.mockReturnValue({
    activeView: ticketState.activeView,
    setView: ticketState.setView,
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <SettingsThemeProvider>
          <MemoryRouter initialEntries={['/workspaces/workspace-1']}>
            <AppShellPage />
          </MemoryRouter>
        </SettingsThemeProvider>
      </AppThemeProvider>
    </QueryClientProvider>
  );
}

describe('AppShellPage theme integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('gravity_theme', 'dark');
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.style.cssText = '';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, lastActiveAt: '2026-05-25T12:00:00.000Z' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies account theme settings to root tokens, density, and storage', async () => {
    renderAppShell();

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme', 'marble-blue');
      expect(document.documentElement).toHaveAttribute('data-density', 'compact');
      expect(document.documentElement.style.getPropertyValue('--color-surface-elevated')).toBe('rgba(255, 255, 255, 0.95)');
      expect(document.documentElement.style.getPropertyValue('--color-overlay-scrim')).toBe('rgba(15, 23, 42, 0.7)');
      expect(document.documentElement.style.getPropertyValue('--space-base-multiplier')).toBe('0.75');
      expect(window.localStorage.getItem('gravity_theme')).toBe('marble-blue');
    });
  });
});
