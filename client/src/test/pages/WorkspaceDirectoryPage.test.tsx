import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceDirectoryPage } from '../../pages/WorkspaceDirectoryPage/WorkspaceDirectoryPage.tsx';
import type { WorkspaceSummary } from '../../hooks/useWorkspaceDirectory.ts';

const currentUser = {
  id: 'user-1',
  name: 'Casey Carter',
  email: 'casey@example.com',
  avatar: '',
  role: 'owner',
  tutorial_completed: 1,
};

const workspaces: WorkspaceSummary[] = [
  {
    id: 'workspace-1',
    name: 'Gravity',
    description: 'Core product workspace.',
    key: 'GRA',
    defaultProjectId: 'project-1',
    hostUrl: 'http://localhost:8080',
    joinMode: 'approval_required',
    projectCount: 3,
    memberCount: 5,
    pendingJoinRequestCount: 1,
    memberRole: 'owner',
  },
  {
    id: 'workspace-2',
    name: 'Orbit',
    description: 'Partner workspace.',
    key: 'ORB',
    defaultProjectId: null,
    hostUrl: '',
    joinMode: 'auto_join',
    projectCount: 1,
    memberCount: 2,
    pendingJoinRequestCount: 0,
    memberRole: 'member',
  },
];

function renderWorkspaceDirectoryPage(overrides: Partial<Parameters<typeof WorkspaceDirectoryPage>[0]> = {}) {
  const baseProps: Parameters<typeof WorkspaceDirectoryPage>[0] = {
    currentUser,
    workspaces,
    loading: false,
    activeWorkspaceId: 'workspace-1',
    pendingAction: null,
    errorMessage: null,
    successMessage: null,
    onCreateWorkspace: vi.fn().mockResolvedValue(undefined),
    onRequestJoin: vi.fn().mockResolvedValue(undefined),
    onValidatePeerInvite: vi.fn().mockResolvedValue(undefined),
    onOpenWorkspace: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenAccountPreferences: vi.fn(),
    onSignOut: vi.fn(),
  };

  const props = { ...baseProps, ...overrides };

  return {
    ...render(<WorkspaceDirectoryPage {...props} />),
    props,
  };
}

describe('WorkspaceDirectoryPage', () => {
  it('renders workspace cards and top-level account actions', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspaceDirectoryPage({
      errorMessage: 'Join code expired.',
      successMessage: 'Workspace created.',
    });

    expect(screen.getByText('Choose where this account works.')).toBeInTheDocument();
    expect(screen.getByText('Join code expired.')).toBeInTheDocument();
    expect(screen.getByText('Workspace created.')).toBeInTheDocument();
    expect(screen.getByText('Gravity')).toBeInTheDocument();
    expect(screen.getByText('Orbit')).toBeInTheDocument();

    const gravityCard = screen.getByText('Gravity').closest('div');
    expect(gravityCard).not.toBeNull();

    const openButtons = screen.getAllByRole('button', { name: 'Open' });
    const settingsButtons = screen.getAllByRole('button', { name: 'Settings' });
    await user.click(openButtons[0]);
    expect(props.onOpenWorkspace).toHaveBeenCalledWith('workspace-1');

    await user.click(settingsButtons[0]);
    expect(props.onOpenSettings).toHaveBeenCalledWith('workspace-1');

    await user.click(screen.getByRole('button', { name: 'Preferences' }));
    expect(props.onOpenAccountPreferences).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('submits the create workspace form with derived defaults', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspaceDirectoryPage();

    await user.type(screen.getByLabelText('Workspace Name'), 'Acme Corp');
    await user.type(screen.getByLabelText('Workspace Key'), 'acm');
    await user.type(screen.getByLabelText('Private Access Key'), 'private');
    await user.type(screen.getByLabelText('Description'), 'Internal product workspace');
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));

    expect(props.onCreateWorkspace).toHaveBeenCalledWith({
      name: 'Acme Corp',
      description: 'Internal product workspace',
      key: 'ACM',
      workspaceKey: 'PRIVATE',
      defaultProjectName: 'Acme Corp Core',
      defaultProjectKey: 'ACM',
    });
  });

  it('submits join-request and peer-validation forms', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspaceDirectoryPage();

    await user.type(screen.getByLabelText('Invite Code'), 'wsp-grav-1234');
    await user.type(screen.getByLabelText('Message'), 'Requesting access for QA coverage.');
    await user.click(screen.getByRole('button', { name: 'Send Join Request' }));

    expect(props.onRequestJoin).toHaveBeenCalledWith('WSP-GRAV-1234', 'Requesting access for QA coverage.');

    await user.type(screen.getByLabelText('Guest Email'), 'guest@example.com');
    await user.type(screen.getByLabelText('Validation Code'), 'grav-4321-x');
    await user.type(screen.getByLabelText('Invite URL'), 'https://peer.example.com/api/v1/workspaces/validate');

    const usernameInput = screen.getByLabelText('Guest Username');
    await user.clear(usernameInput);
    await user.type(usernameInput, 'guest-user');

    const passwordHashInput = screen.getByLabelText('Password Hash');
    await user.type(passwordHashInput, '$2b$12$abcdefghijklmnopqrstuvwxyz1234567890');
    await user.click(screen.getByRole('button', { name: 'Validate Peer Invite' }));

    expect(props.onValidatePeerInvite).toHaveBeenCalledWith({
      email: 'guest@example.com',
      validationCode: 'GRAV-4321-X',
      inviteUrl: 'https://peer.example.com/api/v1/workspaces/validate',
      username: 'guest-user',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuvwxyz1234567890',
    });
  });

  it('shows the loading and empty-state messages when no workspaces are available', () => {
    const { rerender } = renderWorkspaceDirectoryPage({ loading: true, workspaces: [] });
    expect(screen.getByText('Loading workspaces...')).toBeInTheDocument();

    rerender(
      <WorkspaceDirectoryPage
        currentUser={currentUser}
        workspaces={[]}
        loading={false}
        activeWorkspaceId=""
        pendingAction={null}
        errorMessage={null}
        successMessage={null}
        onCreateWorkspace={vi.fn()}
        onRequestJoin={vi.fn()}
        onValidatePeerInvite={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenAccountPreferences={vi.fn()}
        onSignOut={vi.fn()}
      />
    );

    expect(screen.getByText('No approved workspaces yet. Create one or request access with an invite code.')).toBeInTheDocument();
  });
});