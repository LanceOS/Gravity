import type { ChangeEvent, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyWorkspaceScreen } from '../../components/EmptyWorkspaceScreen/EmptyWorkspaceScreen.tsx';

type MockInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

type MockTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
};

vi.mock('@library', () => ({
  TextInput: ({ label, value, onChange, ...props }: MockInputProps) => (
    <label>
      <span>{label}</span>
      <input value={value} onChange={onChange} {...props} />
    </label>
  ),
  Textarea: ({ label, value, onChange, ...props }: MockTextareaProps) => (
    <label>
      <span>{label}</span>
      <textarea value={value} onChange={onChange} {...props} />
    </label>
  ),
}));

function renderEmptyWorkspaceScreen(overrides = {}) {
  const props = {
    currentUser: {
      id: 'user-1',
      name: 'Casey Carter',
      email: 'casey@example.com',
      avatar: '',
      role: 'owner',
    },
    pendingAction: null,
    errorMessage: null,
    onCreateProject: vi.fn().mockResolvedValue(undefined),
    onJoinProject: vi.fn().mockResolvedValue(undefined),
    onSignOut: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<EmptyWorkspaceScreen {...props} />),
    props,
  };
}

describe('EmptyWorkspaceScreen', () => {
  it('normalizes project keys and submits create-project payloads', async () => {
    const user = userEvent.setup();
    const { props } = renderEmptyWorkspaceScreen();

    await user.type(screen.getByLabelText('Project Name'), 'Gravity Core');
    await user.type(screen.getByLabelText('Project Key'), 'gra');
    await user.type(screen.getByLabelText('Description'), 'Primary platform project');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));

    expect(props.onCreateProject).toHaveBeenCalledWith({
      name: 'Gravity Core',
      key: 'GRA',
      description: 'Primary platform project',
    });
  });

  it('normalizes invite codes, surfaces pending labels, and wires sign-out', async () => {
    const user = userEvent.setup();
    const joinView = renderEmptyWorkspaceScreen({ pendingAction: 'join', errorMessage: 'Invite expired' });

    expect(screen.getByText('Invite expired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Joining...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create Project' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(joinView.props.onSignOut).toHaveBeenCalledTimes(1);
  joinView.unmount();

    const freshView = renderEmptyWorkspaceScreen();
    await user.type(screen.getByLabelText('Invite Code'), 'inv-gra-1234');
    await user.click(screen.getByRole('button', { name: 'Join Project' }));

    expect(freshView.props.onJoinProject).toHaveBeenCalledWith('INV-GRA-1234');
  });

  it('shows the create pending label when project creation is in progress', () => {
    renderEmptyWorkspaceScreen({ pendingAction: 'create' });

    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join Project' })).toBeDisabled();
  });
});