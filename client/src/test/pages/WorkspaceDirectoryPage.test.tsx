import { fireEvent, render, screen } from '@testing-library/react';
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
    const user = userEvent.setup({ delay: 0 });
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
    const { props } = renderWorkspaceDirectoryPage();

    fireEvent.change(screen.getByLabelText('Workspace Name'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByLabelText('Workspace Key'), { target: { value: 'acm' } });
    fireEvent.change(screen.getByLabelText('Private Access Key'), { target: { value: 'private' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Internal product workspace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }));

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
    const { props } = renderWorkspaceDirectoryPage();

    fireEvent.change(screen.getByLabelText('Invite Code'), { target: { value: 'wsp-grav-1234' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Requesting access for QA coverage.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Join Request' }));

    expect(props.onRequestJoin).toHaveBeenCalledWith('WSP-GRAV-1234', 'Requesting access for QA coverage.');

    fireEvent.change(screen.getByLabelText('Guest Email'), { target: { value: 'guest@example.com' } });
    fireEvent.change(screen.getByLabelText('Validation Code'), { target: { value: 'grav-4321-x' } });
    fireEvent.change(screen.getByLabelText('Invite URL'), { target: { value: 'https://peer.example.com/api/v1/workspaces/validate' } });

    const usernameInput = screen.getByLabelText('Guest Username');
    fireEvent.change(usernameInput, { target: { value: 'guest-user' } });

    const passwordHashInput = screen.getByLabelText('Password Hash');
    fireEvent.change(passwordHashInput, { target: { value: '$2b$12$abcdefghijklmnopqrstuvwxyz1234567890' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate Peer Invite' }));

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