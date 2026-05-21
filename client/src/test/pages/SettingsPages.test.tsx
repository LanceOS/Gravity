import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../../pages/SettingsPage/SettingsPage.tsx';
import { AccountPreferencesPage } from '../../pages/AccountPreferencesPage/AccountPreferencesPage.tsx';

const currentUser = {
  id: 'user-1',
  name: 'Casey Carter',
  email: 'casey@example.com',
  avatar: '',
  role: 'owner',
  tutorial_completed: 1,
};

const workspace = {
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
  const props = {
    currentUser,
    workspace,
    settings: {
      hostUrl: 'http://localhost:8080',
      joinMode: 'approval_required' as const,
      workspaceKey: 'PRIVATE',
    },
    settingsLoading: false,
    saveLoading: false,
    saveSuccess: false,
    saveError: null,
    inviteError: null,
    invitesLoading: false,
    inviteLoading: false,
    federationConnections: [],
    connectionsLoading: false,
    connectionsError: null,
    retryingConnectionId: null,
    invites: [
      {
        id: 'invite-1',
        email: 'guest@example.com',
        inviteUrl: 'https://peer.example.com/invite/abc',
        validationCode: 'GRAV-1234',
        workspacePrivateKey: 'PRIVATE',
        expiresAt: '2026-05-30T12:00:00.000Z',
        revokedAt: null,
        isUsed: false,
        guestUsername: '',
      },
    ],
    members: [
      {
        id: 'member-1',
        name: 'Casey Carter',
        email: 'casey@example.com',
        avatar: '',
        role: 'owner',
      },
    ],
    joinRequests: [
      {
        id: 'request-1',
        requesterName: 'Robin Quinn',
        requesterEmail: 'robin@example.com',
        message: 'Requesting access for release support.',
        status: 'pending',
        reviewedByName: null,
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
    onRetryConnection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

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
    },
    settingsLoading: false,
    saveLoading: false,
    saveSuccess: false,
    saveError: null,
    testing: false,
    testResult: null,
    tutorialResult: null,
    ollamaModels: ['llama3', 'phi3'],
    ollamaModelsLoading: false,
    onBack: vi.fn(),
    onOpenDirectory: vi.fn(),
    onChangeSettings: vi.fn(),
    onRefreshOllamaModels: vi.fn(),
    onResetTutorial: vi.fn(),
    onSaveSettings: vi.fn(),
    onTestApiKey: vi.fn(),
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
    expect(screen.getByText('Peer Invites')).toBeInTheDocument();
    expect(screen.getByText('Most Recent Invite')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Guest Email'));
    await user.type(screen.getByLabelText('Guest Email'), 'new-guest@example.com');
    await user.clear(screen.getByLabelText('Expires In (Hours)'));
    await user.type(screen.getByLabelText('Expires In (Hours)'), '48');
    await user.click(screen.getByRole('button', { name: 'Create Invite' }));
    expect(props.onCreateInvite).toHaveBeenCalledWith({
      email: 'new-guest@example.com',
      expirationHours: 48,
    });

    await user.click(screen.getByRole('button', { name: /Members/i }));
    expect(screen.getByText('Approved Members')).toBeInTheDocument();
    expect(screen.getByText('casey@example.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Join Requests/i }));
    expect(screen.getByText('Robin Quinn')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(props.onApproveJoinRequest).toHaveBeenCalledWith('request-1');
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
      testResult: { success: true, message: 'Provider connection ok.' },
      tutorialResult: { success: true, message: 'Tutorial will replay on next load.' },
    });

    await user.click(screen.getByRole('button', { name: /Cloud AI/i }));
    expect(screen.getByText('Cloud AI provider')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Provider' }));
    await user.click(screen.getByRole('option', { name: 'Anthropic' }));
    expect(props.onChangeSettings).toHaveBeenCalledWith({ aiProvider: 'anthropic' });
    await user.click(screen.getByRole('button', { name: 'Test OpenAI' }));
    expect(props.onTestApiKey).toHaveBeenCalledTimes(1);
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
});