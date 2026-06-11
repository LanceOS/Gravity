import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, Route, Routes } from 'react-router-dom';
import { AppShellPage } from '../../pages/AppShellPage/AppShellPage.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
    };
    projects?: {
      onSelectLabel?: (labelId: string) => void;
    };
  };
  children?: ReactNode;
  rightPanels?: ReactNode;
};

type WorkspacePageMockProps = {
  onSelectNote?: (noteId: string) => void;
  onDeleteTicket?: (ticketId: string) => void;
};

const mocks = vi.hoisted(() => ({
  useTickets: vi.fn(),
  useWorkspaceDirectory: vi.fn(),
  useAccountSettings: vi.fn(),
  useWorkspaceSettings: vi.fn(),
  registerWebMCPTools: vi.fn(() => null),
  fetch: vi.fn(),
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('../../context/TicketContext', () => ({
  useTickets: mocks.useTickets,
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

vi.mock('../../modules/tickets', () => ({
  CreateTicketModal: () => <div>CreateTicketModal</div>,
}));

vi.mock('../../modules/tickets/components/TicketDetailRoute', () => ({
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
}));



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
      <button type="button" onClick={sidebarProps.userMenu.onOpenSettings}>
        Open settings
      </button>
      <button type="button" onClick={sidebarProps.userMenu.onOpenAccountPreferences}>
        Open account preferences
      </button>
      <button type="button" onClick={sidebarProps.userMenu.onOpenProjectManager}>
        Open project manager
      </button>
      <button type="button" onClick={() => sidebarProps.projects?.onSelectLabel?.('d-1')}>
        Select label
      </button>
      {children}
      {rightPanels}
    </div>
  ),
}));

vi.mock('../../pages/LoadingPage/LoadingPage', () => ({
  LoadingPage: () => <div>LoadingPage</div>,
}));

vi.mock('../../pages/WorkspaceDirectoryPage/WorkspaceDirectoryPage', () => ({
  WorkspaceDirectoryPage: () => <div>WorkspaceDirectoryPage</div>,
}));

vi.mock('../../pages/WorkspacePage/WorkspacePage', () => ({
  WorkspacePage: ({ onSelectNote, onDeleteTicket }: WorkspacePageMockProps) => (
    <div>
      <div>WorkspacePage</div>
      {onSelectNote ? (
        <button type="button" onClick={() => onSelectNote('note-1')}>
          Open note
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

vi.mock('../../pages/WorkspaceProjectsPage/WorkspaceProjectsPage', () => ({
  WorkspaceProjectsPage: () => <div>WorkspaceProjectsPage</div>,
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
  const currentUser = (overrides.currentUser as ReturnType<typeof makeCurrentUser> | null | undefined) ?? makeCurrentUser();

  return {
    activeProjectId: 'project-1',
    activeTicket: null,
    activeView: 'board',
    addComment: vi.fn(),
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
    signOut: vi.fn(),
    theme: 'dark',
    tickets: [],
    updateTicket: vi.fn(),
    users: [currentUser].filter(Boolean),
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
}: {
  tickets?: Record<string, unknown>;
  directory?: Record<string, unknown>;
  account?: Record<string, unknown>;
  workspaceSettings?: Record<string, unknown>;
  initialEntries?: string[];
} = {}) {
  mocks.useTickets.mockReturnValue(tickets);
  mocks.useWorkspaceDirectory.mockReturnValue(directory);
  mocks.useAccountSettings.mockReturnValue(account);
  mocks.useWorkspaceSettings.mockReturnValue(workspaceSettings);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <LocationDisplay />
        <Routes>
          <Route path="/workspaces/:workspaceId/projects/:projectId/tickets/:ticketKey" element={<AppShellPage />} />
          <Route path="/workspaces/:workspaceId/projects/:projectId/tickets" element={<AppShellPage />} />
          <Route path="/workspaces/:workspaceId/projects/:projectId/notes" element={<AppShellPage />} />
          <Route path="/workspaces/:workspaceId/projects/:projectId/notes/:noteId" element={<AppShellPage />} />
          <Route path="/workspaces/:workspaceId" element={<AppShellPage />} />
          <Route path="*" element={<AppShellPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AppShellPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
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

  it('routes signed-in users without workspaces to the directory page', async () => {
    renderAppShell({
      directory: buildWorkspaceDirectory({ workspaces: [] }),
    });

    await waitFor(() => {
      expect(screen.getByText('WorkspaceDirectoryPage')).toBeInTheDocument();
    });
  });

  it('renders onboarding for incomplete tutorials and marks the current user complete when dismissed', async () => {
    const user = userEvent.setup();
    const tickets = buildUseTickets({
      currentUser: makeCurrentUser({ tutorial_completed: 0 }),
      setCurrentUser: vi.fn(),
    });

    renderAppShell({ tickets });

    await waitFor(() => {
      expect(screen.getByText('OnboardingModal')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Complete onboarding' }));
    expect(tickets.setCurrentUser).toHaveBeenCalledWith({
      ...tickets.currentUser,
      tutorial_completed: 1,
    });
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

  it('records member activity for the active workspace', async () => {
    renderAppShell();

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/workspaces/workspace-1/members/user-1/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'user-1',
        },
      });
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

    expect(setView).toHaveBeenCalledWith('list');

    // Restore window.innerWidth
    window.innerWidth = originalInnerWidth;
  });
});
