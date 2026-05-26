import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsScreen as SettingsPage } from '../../modules/settings';
import { AccountPreferencesPage } from '../../pages/AccountPreferencesPage/AccountPreferencesPage.tsx';
import type { WorkspaceSummary } from '../../hooks/useWorkspaceDirectory.ts';
import { API_KEY_MASK } from '../../utils/settings.ts';

const currentUser = {
  id: 'user-1',
  name: 'Casey Carter',
  email: 'casey@example.com',
  avatar: '',
  role: 'owner',
  tutorial_completed: 1,
};

const workspace: WorkspaceSummary = {
  id: 'workspace-1',
  name: 'Gravity',
  description: 'Primary workspace',
  key: 'GRA',
  defaultProjectId: 'project-1',
  hostUrl: 'http://localhost:8080',
  joinMode: 'approval_required',
  projectCount: 3,
  memberCount: 5,
  pendingJoinRequestCount: 1,
  memberRole: 'owner',
};

function renderSettingsPage(overrides: Partial<Parameters<typeof SettingsPage>[0]> = {}) {
  const baseProps: Parameters<typeof SettingsPage>[0] = {
    currentUser,
    workspace,
    settings: {
      workspaceId: workspace.id,
      key: workspace.key,
      hostUrl: 'http://localhost:8080',
      joinMode: 'approval_required' as const,
      workspaceKey: 'PRIVATE',
      disabledMcpTools: [],
    },
    settingsLoading: false,
    saveLoading: false,
    saveSuccess: false,
    saveError: null,
    inviteError: null,
    invitesLoading: false,
    inviteLoading: false,
    invites: [
      {
        id: 'invite-1',
        code: 'WSP-GRAV-1234',
        label: 'Engineering Team',
        expiresAt: null,
        revokedAt: null,
        maxUses: null,
        useCount: 0,
        createdAt: '2026-05-20T08:00:00.000Z',
        createdByName: 'Casey Carter',
        pendingJoinRequestCount: 0,
      },
    ],
    members: [
      {
        id: 'member-1',
        name: 'Casey Carter',
        email: 'casey@example.com',
        avatar: '',
        role: 'owner',
        createdAt: '2026-05-01T09:00:00.000Z',
        savedCredentials: [],
        lastActiveAt: new Date().toISOString(), // Today
      },
      {
        id: 'member-2',
        name: 'Robin Quinn',
        email: 'robin@example.com',
        avatar: '',
        role: 'developer',
        createdAt: '2026-05-02T09:00:00.000Z',
        lastActiveAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
      },
      {
        id: 'member-3',
        name: 'Jamie Doe',
        email: 'jamie@example.com',
        avatar: '',
        role: 'developer',
        createdAt: '2026-05-03T09:00:00.000Z',
        lastActiveAt: '2026-05-20T12:00:00.000Z', // Specific older date
      },
      {
        id: 'member-4',
        name: 'Morgan Lee',
        email: 'morgan@example.com',
        avatar: '',
        role: 'developer',
        createdAt: '2026-05-04T09:00:00.000Z',
        lastActiveAt: null, // Never active
      },
    ],
    joinRequests: [
      {
        id: 'request-1',
        requestingUserId: 'user-2',
        requesterName: 'Robin Quinn',
        requesterEmail: 'robin@example.com',
        requesterAvatar: null,
        message: 'Requesting access for release support.',
        status: 'pending',
        reviewedBy: null,
        reviewedByName: null,
        reviewedAt: null,
        createdAt: '2026-05-20T09:00:00.000Z',
      },
    ],
    approveLoadingId: null,
    revokeLoadingId: null,
    onBackToWorkspace: vi.fn(),
    onOpenDirectory: vi.fn(),
    onChangeSettings: vi.fn(),
    onSaveSettings: vi.fn(),
    onCreateInvite: vi.fn().mockResolvedValue(true),
    onRevokeInvite: vi.fn().mockResolvedValue(true),
    onApproveJoinRequest: vi.fn().mockResolvedValue(true),
  };

  const props = { ...baseProps, ...overrides };

  return {
    ...render(<SettingsPage {...props} />),
    props,
  };
}

function renderAccountPreferencesPage(overrides: Partial<Parameters<typeof AccountPreferencesPage>[0]> = {}) {
  const props = {
    currentUser,
    settings: {
      defaultView: 'board' as const,
      theme: 'dark' as const,
      projectLayout: 'standard' as const,
      aiProvider: 'openai' as const,
      apiKey: '',
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'llama3',
      agentIntegration: 'ollama' as const,
    },
    settingsLoading: false,
    saveLoading: false,
    saveSuccess: false,
    saveError: null,
    hasProviderChanges: false,
    testing: false,
    testResult: null,
    savedCredentials: [],
    tutorialResult: null,
    ollamaModels: ['llama3', 'phi3'],
    ollamaModelsLoading: false,
    onBack: vi.fn(),
    onOpenDirectory: vi.fn(),
    onChangeSettings: vi.fn(),
    onResetProviderDraft: vi.fn(),
    onRefreshOllamaModels: vi.fn(),
    onResetTutorial: vi.fn(),
    onSaveSettings: vi.fn(),
    onTestApiKey: vi.fn(),
    hasChanges: true,
    ...overrides,
  };

  return {
    ...render(<AccountPreferencesPage {...props} />),
    props,
  };
}

describe('SettingsPage', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    window.sessionStorage.clear();
  });

  it('renders overview controls and forwards navigation and save actions', async () => {
    const user = userEvent.setup();
    const { props } = renderSettingsPage({
      settingsLoading: true,
      saveError: 'Save failed.',
      inviteError: 'Invite failed.',
    });

    expect(screen.getByText('Workspace Settings')).toBeInTheDocument();
    expect(screen.getByText('Loading workspace administration data...')).toBeInTheDocument();
    expect(screen.getByText('Save failed.')).toBeInTheDocument();
    expect(screen.getByText('Invite failed.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Host URL'), {
      target: { value: 'http://peer.example.com' },
    });
    expect(props.onChangeSettings).toHaveBeenCalledWith({ hostUrl: 'http://peer.example.com' });

    await user.click(screen.getByRole('button', { name: 'Join Policy' }));
    await user.click(screen.getByRole('option', { name: 'Auto Join' }));
    expect(props.onChangeSettings).toHaveBeenCalledWith({ joinMode: 'auto_join' });

    await user.click(screen.getByRole('button', { name: 'Workspace' }));
    expect(props.onBackToWorkspace).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Workspaces' }));
    expect(props.onOpenDirectory).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(props.onSaveSettings).toHaveBeenCalledTimes(1);
  });

  it('switches between sections and handles invite creation and join approval', async () => {
    const user = userEvent.setup();
    const { props } = renderSettingsPage();

    await user.click(screen.getByRole('button', { name: /Invites/i }));
    expect(screen.getByText('Workspace Invites')).toBeInTheDocument();
    expect(screen.getByText('Most Recent Invite')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Invite Label'));
    await user.type(screen.getByLabelText('Invite Label'), 'Engineering Team');
    await user.click(screen.getByRole('button', { name: 'Create Invite' }));
    expect(props.onCreateInvite).toHaveBeenCalledWith({
      label: 'Engineering Team',
    });

    await user.click(screen.getByRole('button', { name: /Members/i }));
    expect(screen.getByText('Approved Members')).toBeInTheDocument();
    expect(screen.getByText('casey@example.com')).toBeInTheDocument();
    expect(screen.getByText('Last active: Today')).toBeInTheDocument();
    expect(screen.getByText('Last active: Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Last active: Never')).toBeInTheDocument();
    expect(screen.getAllByText(/Last active:/)).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: /Join Requests/i }));
    expect(screen.getByText('Robin Quinn')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(props.onApproveJoinRequest).toHaveBeenCalledWith('request-1');
  });

  it('handles MCP Tools disablement switches for owners', async () => {
    const user = userEvent.setup();

    // Test: Owner user
    const { props } = renderSettingsPage({
      workspace: { ...workspace, memberRole: 'owner' },
      settings: {
        workspaceId: workspace.id,
        key: workspace.key,
        hostUrl: 'http://localhost:8080',
        joinMode: 'approval_required' as const,
        workspaceKey: 'PRIVATE',
        disabledMcpTools: ['list_tickets'],
      },
    });

    await user.click(screen.getByRole('button', { name: /MCP Tools/i }));
    expect(screen.getByText('MCP Agent Tools')).toBeInTheDocument();
    
    // Switch for list_tickets (should be disabled/unchecked as it is in disabledMcpTools)
    const listTicketsRow = screen.getByTestId('mcp-tool-row-list_tickets');
    const listTicketsSwitch = within(listTicketsRow).getByRole('switch');
    expect(listTicketsSwitch).toBeInTheDocument();
    expect(listTicketsSwitch).toHaveAttribute('aria-checked', 'false');

    // Switch for create_ticket (should be enabled/checked as it is not in disabledMcpTools)
    const createTicketRow = screen.getByTestId('mcp-tool-row-create_ticket');
    const createTicketSwitch = within(createTicketRow).getByRole('switch');
    expect(createTicketSwitch).toBeInTheDocument();
    expect(createTicketSwitch).toHaveAttribute('aria-checked', 'true');

    // Toggle create_ticket (disabling it: adding to disabledMcpTools)
    await user.click(createTicketSwitch);
    expect(props.onChangeSettings).toHaveBeenCalledWith({
      disabledMcpTools: ['list_tickets', 'create_ticket'],
    });

    // Toggle list_tickets (enabling it: removing from disabledMcpTools)
    await user.click(listTicketsSwitch);
    expect(props.onChangeSettings).toHaveBeenCalledWith({
      disabledMcpTools: [],
    });
  });

  it('blocks non-owners from toggling MCP Tools', async () => {
    const user = userEvent.setup();

    // Test: Non-owner user (read-only view)
    renderSettingsPage({
      workspace: { ...workspace, memberRole: 'member' },
      settings: {
        workspaceId: workspace.id,
        key: workspace.key,
        hostUrl: 'http://localhost:8080',
        joinMode: 'approval_required' as const,
        workspaceKey: 'PRIVATE',
        disabledMcpTools: ['list_tickets'],
      },
    });

    // Navigate to the MCP Tools category tab first!
    await user.click(screen.getByRole('button', { name: /MCP Tools/i }));

    // Alert showing only owners can modify should be visible
    expect(screen.getByText('Only workspace owners can enable or disable MCP agent tools.')).toBeInTheDocument();

    // Switches should be disabled
    const readOnlyRow = screen.getAllByTestId(/mcp-tool-row-/)[0];
    const readOnlySwitch = within(readOnlyRow).getByRole('switch');
    expect(readOnlySwitch).toBeDisabled();
  });
});

describe('AccountPreferencesPage', () => {
  it('renders the general section and forwards navigation, save, and settings updates', async () => {
    const user = userEvent.setup();
    const { props } = renderAccountPreferencesPage({
      settingsLoading: true,
      saveError: 'Unable to save local preferences.',
    });

    expect(screen.getByText('Account Preferences')).toBeInTheDocument();
    expect(screen.getByText('Loading saved account settings...')).toBeInTheDocument();
    expect(screen.getByText('Unable to save local preferences.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Default View Mode' }));
    await user.click(screen.getByRole('option', { name: 'Issues List' }));
    expect(props.onChangeSettings).toHaveBeenCalledWith({ defaultView: 'list' });

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onBack).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Workspaces' }));
    expect(props.onOpenDirectory).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(props.onSaveSettings).toHaveBeenCalledTimes(1);
  });

  it('switches provider, ollama, and onboarding sections and forwards actions', async () => {
    const user = userEvent.setup();
    const { props } = renderAccountPreferencesPage({
      hasProviderChanges: true,
      testResult: { success: true, message: 'Provider connection ok.' },
      tutorialResult: { success: true, message: 'Tutorial will replay on next load.' },
    });

    await user.click(screen.getByRole('button', { name: /Cloud AI/i }));
    expect(screen.getByText('Cloud AI provider')).toBeInTheDocument();
    expect(props.onResetProviderDraft).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Provider' }));
    await user.click(screen.getByRole('option', { name: 'Anthropic' }));
    expect(props.onChangeSettings).toHaveBeenCalledWith({ aiProvider: 'anthropic' });
    await user.click(screen.getByRole('button', { name: 'Test OpenAI' }));
    expect(props.onTestApiKey).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Save Key' }));
    expect(props.onSaveSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Provider connection ok.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ollama/i }));
    expect(screen.getByText('Local Ollama assistant')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(props.onRefreshOllamaModels).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Detected Ollama Model' }));
    await user.click(screen.getByRole('option', { name: 'phi3' }));
    expect(props.onChangeSettings).toHaveBeenCalledWith({ ollamaModel: 'phi3' });

    await user.click(screen.getByRole('button', { name: /Onboarding/i }));
    expect(screen.getByText('Onboarding and guidance')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset & Start Tutorial' }));
    expect(props.onResetTutorial).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Tutorial will replay on next load.')).toBeInTheDocument();
  });

  it('shows saved cloud keys with active and inactive tags', async () => {
    const user = userEvent.setup();

    renderAccountPreferencesPage({
      savedCredentials: [
        { provider: 'openai', apiKey: API_KEY_MASK },
        { provider: 'anthropic', apiKey: API_KEY_MASK },
      ],
    });

    await user.click(screen.getByRole('button', { name: /Cloud AI/i }));

    expect(screen.getByText('Saved keys')).toBeInTheDocument();
    expect(screen.getByText('2 saved')).toBeInTheDocument();
    expect(screen.getAllByText('OpenAI')).toHaveLength(2);
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getAllByText(API_KEY_MASK)).toHaveLength(2);
  });

  it('allows pasting an API key into the cloud provider field', async () => {
    const user = userEvent.setup();
    const { props } = renderAccountPreferencesPage();

    await user.click(screen.getByRole('button', { name: /Cloud AI/i }));
    const apiKeyInput = screen.getByLabelText('API Key');

    await user.click(apiKeyInput);
    await user.paste('sk-pasted-test-key');

    expect(props.onChangeSettings).toHaveBeenCalledWith({ apiKey: 'sk-pasted-test-key' });
  });
});