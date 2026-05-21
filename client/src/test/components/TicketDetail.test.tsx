import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketDetail } from '../../components/TicketDetail/TicketDetail.tsx';

type MockButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  variant?: string;
  size?: string;
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
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
};

vi.mock('@library', () => ({
  Button: ({ children, ...props }: MockButtonProps) => {
    const buttonProps = { ...props };
    delete buttonProps.variant;
    delete buttonProps.size;
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
  TextInput: ({ value, onChange, ...props }: MockTextInputProps) => <input value={value} onChange={onChange} {...props} />,
  Textarea: ({ value, onChange, ...props }: MockTextareaProps) => <textarea value={value} onChange={onChange} {...props} />,
}));

vi.mock('../../components/TicketDetail/components', () => ({
  MarkdownContent: ({ text }: { text: string }) => <div>{text}</div>,
}));

const activeTicket = {
  id: 'ticket-1',
  key: 'GRA-101',
  title: 'Fix sync retries',
  description: 'Retry the event stream after disconnects.',
  status: 'todo' as const,
  priority: 'medium' as const,
  assigneeId: 'user-1',
  projectId: 'project-1',
  domainId: 'domain-1',
  cycleId: 'cycle-1',
  parentId: null,
  prStatus: 'open' as const,
  prUrl: 'https://github.com/LanceOS/Gravity/pull/101',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
};

const subtaskOne = {
  ...activeTicket,
  id: 'ticket-2',
  key: 'GRA-102',
  title: 'Ship retry fix',
  status: 'done' as const,
  parentId: 'ticket-1',
};

const subtaskTwo = {
  ...activeTicket,
  id: 'ticket-3',
  key: 'GRA-103',
  title: 'Verify SSE recovery',
  status: 'in_review' as const,
  parentId: 'ticket-1',
};

const comments = [
  {
    id: 'comment-1',
    ticketId: 'ticket-1',
    userId: 'user-1',
    body: 'PR is ready for review.',
    createdAt: '2026-05-03T15:00:00.000Z',
    userName: 'Casey Carter',
    userAvatar: 'https://example.com/avatar.png',
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
  {
    id: 'user-2',
    name: 'Robin Quinn',
    email: 'robin@example.com',
    avatar: '',
    role: 'member',
  },
];

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

const domains = [
  {
    id: 'domain-1',
    name: 'Platform',
    color: '#10b981',
  },
  {
    id: 'domain-2',
    name: 'Experience',
    color: '#3b82f6',
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
  {
    id: 'cycle-2',
    name: 'Sprint 2',
    startDate: '2026-05-16',
    endDate: '2026-05-30',
    completed: 0,
  },
];

function renderTicketDetail(overrides: Partial<Parameters<typeof TicketDetail>[0]> = {}) {
  const props = {
    activeTicket,
    comments,
    subtasks: [subtaskOne, subtaskTwo],
    completedSubtasks: 1,
    subtaskProgressPercent: 50,
    users,
    projects,
    domains,
    cycles,
    onSelectTicket: vi.fn(),
    onUpdateTicket: vi.fn().mockResolvedValue(undefined),
    onDeleteTicket: vi.fn().mockResolvedValue(undefined),
    onAddComment: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    onOpenCreateSubtask: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<TicketDetail {...props} />),
    props,
  };
}

describe('TicketDetail', () => {
  it('updates title and description, selects related subtasks, and posts comments', async () => {
    const user = userEvent.setup();
    const { props } = renderTicketDetail();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText('Fix sync retries'));
    const titleInput = screen.getByDisplayValue('Fix sync retries');
    await user.clear(titleInput);
    await user.type(titleInput, 'Stabilize sync retries');
    await user.tab();
    await waitFor(() => {
      expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { title: 'Stabilize sync retries' });
    });

    await user.click(screen.getByRole('button', { name: 'Edit Description' }));
    await user.click(screen.getByRole('button', { name: /Write/i }));
    const descriptionInput = screen.getByPlaceholderText('Describe your issue using markdown...');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'Add retry backoff and better logging.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', {
        description: 'Add retry backoff and better logging.',
      });
    });

    await user.click(screen.getByRole('button', { name: 'Add Subtask' }));
    expect(props.onOpenCreateSubtask).toHaveBeenCalledWith('ticket-1');

    await user.click(screen.getByText('Ship retry fix'));
    expect(props.onSelectTicket).toHaveBeenCalledWith(subtaskOne);

    await user.type(screen.getByPlaceholderText('Post updates, links, or mention PRs...'), 'Comment from test');
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() => {
      expect(props.onAddComment).toHaveBeenCalledWith('ticket-1', 'Comment from test');
    });
  });

  it('forwards selector changes and handles the delete confirmation flow', async () => {
    const user = userEvent.setup();
    const { props } = renderTicketDetail();

    await user.selectOptions(screen.getByLabelText('Select ticket status'), 'done');
    expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { status: 'done' });

    await user.selectOptions(screen.getByLabelText('Select ticket priority'), 'urgent');
    expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { priority: 'urgent' });

    await user.selectOptions(screen.getByLabelText('Select ticket assignee'), 'user-2');
    expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { assigneeId: 'user-2' });

    await user.selectOptions(screen.getByLabelText('Select ticket project'), 'project-2');
    expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { projectId: 'project-2' });

    await user.selectOptions(screen.getByLabelText('Select ticket domain'), 'domain-2');
    expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { domainId: 'domain-2' });

    await user.selectOptions(screen.getByLabelText('Select ticket cycle'), 'cycle-2');
    expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { cycleId: 'cycle-2' });

    await user.click(screen.getAllByRole('button', { name: 'Delete Ticket' })[0]);
    expect(screen.getByText('Delete GRA-101?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete GRA-101?')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Delete Ticket' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Delete Ticket' })[1]);
    await waitFor(() => {
      expect(props.onDeleteTicket).toHaveBeenCalledWith('ticket-1');
    });
  });
});