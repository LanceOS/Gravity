import type { ButtonHTMLAttributes, ChangeEvent, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTicketModal } from '../../modules/tickets';

type MockButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  variant?: string;
};

type MockSelectOption = {
  value: string;
  label: string;
};

type MockSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  options: MockSelectOption[];
  onValueChange: (value: string) => void;
};

type MockTextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

type MockTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  inputStyle?: React.CSSProperties;
  autoGrow?: boolean;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
};

type MockModalProps = {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

vi.mock('@library', () => ({
  Button: ({ children, ...props }: MockButtonProps) => {
    const buttonProps = { ...props };
    delete buttonProps.variant;
    return <button {...buttonProps}>{children}</button>;
  },
  Select: ({ options, onValueChange, ...props }: MockSelectProps) => (
    <select {...props} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  Modal: ({ isOpen, title, children, footer }: MockModalProps) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
  Alert: ({ children }: { children: ReactNode }) => <div role="alert">{children}</div>,
  TextInput: ({ value, onChange, ...props }: MockTextInputProps) => <input value={value} onChange={onChange} {...props} />,
  Textarea: ({ label, value, onChange, inputStyle: _inputStyle, autoGrow: _autoGrow, ...props }: MockTextareaProps) => (
    <div>
      {label ? (
        <label>
          {label}
          <textarea value={value} onChange={onChange} {...props} />
        </label>
      ) : (
        <textarea value={value} onChange={onChange} {...props} />
      )}
    </div>
  ),
  Popover: ({ trigger, children }: any) => (
    <div>
      {trigger}
      <div>{children}</div>
    </div>
  ),
}));

const projects = [
  {
    id: 'project-1',
    name: 'Gravity Core',
    description: 'Primary project',
    key: 'GRA',
    status: 'active' as const,
    workspaceId: 'workspace-1',
  },
  {
    id: 'project-2',
    name: 'Orbit Delivery',
    description: 'Partner project',
    key: 'ORB',
    status: 'planned' as const,
    workspaceId: 'workspace-1',
  },
];

const labels = [
  {
    id: 'domain-1',
    name: 'Platform',
    color: '#10b981',
    projectId: 'project-1',
  },
];

const cycles = [
  {
    id: 'cycle-1',
    name: 'Sprint 1',
    startDate: '2026-05-01',
    endDate: '2026-05-15',
    completed: 0,
  },
];

const users = [
  {
    id: 'user-1',
    name: 'Casey Carter',
    email: 'casey@example.com',
    avatar: '',
    role: 'owner',
  },
];

function renderCreateTicketModal(overrides: Partial<Parameters<typeof CreateTicketModal>[0]> = {}) {
  const props = {
    onClose: vi.fn(),
    projects,
    labels,
    cycles,
    users,
    parentTicket: null,
    defaultProjectId: 'project-1',
    onSubmitTicket: vi.fn().mockResolvedValue(true),
    initialStatus: 'todo' as const,
    parentId: undefined,
    ...overrides,
  };

  return {
    ...render(<CreateTicketModal {...props} />),
    props,
  };
}

describe('CreateTicketModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  it('validates required fields, submits the issue payload, and closes after success', async () => {
    const user = userEvent.setup();
    const { props } = renderCreateTicketModal();

    expect(screen.getByText('Create New Issue')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Issue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a ticket title.');
    expect(props.onSubmitTicket).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Issue Title'), '  Fix sync retries  ');
    await user.type(screen.getByLabelText('Description'), '  Retry failed SSE subscription  ');
    await user.selectOptions(screen.getByLabelText('Select status'), 'in_review');
    await user.selectOptions(screen.getByLabelText('Select priority'), 'high');
    await user.selectOptions(screen.getByLabelText('Select assignee'), 'user-1');
    await user.click(screen.getByRole('checkbox', { name: 'Platform' }));
    await user.selectOptions(screen.getByLabelText('Select cycle'), 'cycle-1');

    await user.click(screen.getByRole('button', { name: 'Create Issue' }));

    await waitFor(() => {
      expect(props.onSubmitTicket).toHaveBeenCalledWith({
        title: 'Fix sync retries',
        description: 'Retry failed SSE subscription',
        status: 'in_review',
        priority: 'high',
        projectId: 'project-1',
        labelIds: ['domain-1'],
        cycleId: 'cycle-1',
        assigneeId: 'user-1',
        parentId: null,
      });
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('locks subtasks to the parent project, supports keyboard shortcuts, and stays open when submission fails', async () => {
    const user = userEvent.setup();
    const parentTicket = {
      id: 'ticket-1',
      key: 'GRA-12',
      title: 'Parent task',
      description: 'Parent task description',
      status: 'todo' as const,
      priority: 'medium' as const,
      assigneeId: null,
      projectId: 'project-2',
      domainId: null,
      cycleId: null,
      parentId: null,
      prStatus: 'none' as const,
      prUrl: null,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    };
    const { props } = renderCreateTicketModal({
      parentTicket,
      defaultProjectId: 'project-1',
      initialStatus: 'backlog',
      parentId: 'ticket-1',
      onSubmitTicket: vi.fn().mockResolvedValue(false),
    });

    expect(screen.getByText('Create Subtask for GRA-12')).toBeInTheDocument();
    expect(screen.getByLabelText('Select project')).toBeDisabled();
    expect(screen.getByLabelText('Select project')).toHaveValue('project-2');
    expect(screen.getByLabelText('Select status')).toHaveValue('backlog');

    await user.type(screen.getByLabelText('Issue Title'), 'Child task');
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(props.onSubmitTicket).toHaveBeenCalledWith({
        title: 'Child task',
        description: '',
        status: 'backlog',
        priority: 'no_priority',
        projectId: 'project-2',
        labelIds: [],
        cycleId: null,
        assigneeId: null,
        parentId: 'ticket-1',
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to create the ticket.');
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
