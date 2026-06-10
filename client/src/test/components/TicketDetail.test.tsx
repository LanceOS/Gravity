import { useState } from 'react';
import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketDetail } from '../../modules/tickets/components/TicketDetail';

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

const mockAssignLabel = vi.fn().mockResolvedValue(true);
const mockUnassignLabel = vi.fn().mockResolvedValue(true);
const mockCreateLabel = vi.fn().mockResolvedValue({ id: 'label-3', name: 'New Label', color: '#6B7280' });

vi.mock('../../context/TicketContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/TicketContext')>();
  return {
    ...actual,
    useTickets: () => ({
      assignLabelToTicket: mockAssignLabel,
      unassignLabelFromTicket: mockUnassignLabel,
      createLabel: mockCreateLabel,
    }),
  };
});

vi.mock('@library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@library')>();
  return {
    ...actual,
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
    Textarea: ({ value, onChange, autoGrow, inputStyle, ...props }: any) => <textarea value={value} onChange={onChange} {...props} />,
    MarkdownEditor: ({ value, onSave, placeholder }: any) => {
      const [editing, setEditing] = useState(false);
      if (!editing) {
        return (
          <div onClick={() => setEditing(true)}>{value || placeholder}</div>
        );
      }
      return (
        <textarea
          placeholder={placeholder}
          defaultValue={value}
          onBlur={(e) => {
            setEditing(false);
            onSave(e.target.value);
          }}
          autoFocus
        />
      );
    },
    ClickAwayListener: ({ children }: { children: ReactNode }) => children,
    Portal: ({ children }: { children: ReactNode }) => <div data-testid="portal">{children}</div>,
  };
});

vi.mock('../../modules/tickets/components/MarkdownContent', () => ({
  MarkdownContent: ({ text }: { text: string }) => <div>{text}</div>,
}));

import { toast } from '@library';

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
  labels: [
    {
      id: 'domain-1',
      projectId: 'project-1',
      name: 'Platform',
      color: '#10b981',
      description: '',
      sortOrder: 0,
    }
  ],
  labelIds: ['domain-1'],
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

const labels = [
  {
    id: 'domain-1',
    projectId: 'project-1',
    name: 'Platform',
    color: '#10b981',
    description: '',
    sortOrder: 0,
  },
  {
    id: 'domain-2',
    projectId: 'project-1',
    name: 'Experience',
    color: '#3b82f6',
    description: '',
    sortOrder: 0,
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
    labels,
    cycles,
    onSelectTicket: vi.fn(),
    onUpdateTicket: vi.fn().mockResolvedValue(undefined),
    onDeleteTicket: vi.fn().mockResolvedValue(undefined),
    onAddComment: vi.fn().mockResolvedValue(undefined),
    onUpdateComment: vi.fn().mockResolvedValue(undefined),
    onDeleteComment: vi.fn().mockResolvedValue(undefined),
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
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});

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

    await user.click(screen.getByText('Retry the event stream after disconnects.'));
    const descriptionInput = screen.getByPlaceholderText('Describe your issue using markdown...');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'Add retry backoff and better logging.');
    await user.tab();
    await waitFor(() => {
      expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', {
        description: 'Add retry backoff and better logging.',
      });
    });

    await user.click(screen.getByRole('button', { name: 'Add Subtask' }));
    expect(props.onOpenCreateSubtask).toHaveBeenCalledWith('ticket-1');

    const subtaskElements = screen.getAllByText('Ship retry fix') as HTMLElement[];
    const subtaskDesktop = subtaskElements.find((el) => el.closest('.ticket-list__row-desktop')) || subtaskElements[0];
    await user.click(subtaskDesktop);
    expect(props.onSelectTicket).toHaveBeenCalledWith(subtaskOne);

    await user.type(screen.getByPlaceholderText('Post updates, links, or mention PRs...'), 'Comment from test');
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() => {
      expect(props.onAddComment).toHaveBeenCalledWith('ticket-1', 'Comment from test');
    });

    backSpy.mockRestore();
  });

  it('forwards editable selector changes, keeps project assignment read-only, and handles the delete confirmation flow', async () => {
    const user = userEvent.setup();
    const { props } = renderTicketDetail();

    const sidebar = within(screen.getByTestId('desktop-sidebar'));

    expect(sidebar.getByLabelText('Select ticket status')).toBeInTheDocument();
    await user.selectOptions(sidebar.getByLabelText('Select ticket status'), 'done');
    expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { status: 'done' });

    await user.selectOptions(sidebar.getByLabelText('Select ticket priority'), 'urgent');
    expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { priority: 'urgent' });

    await user.selectOptions(sidebar.getByLabelText('Select ticket assignee'), 'user-2');
    expect(props.onUpdateTicket).toHaveBeenCalledWith('ticket-1', { assigneeId: 'user-2' });

    expect(sidebar.getByLabelText('Select ticket project')).toBeDisabled();
    expect(
      sidebar.getByText('Project moves are managed outside ticket details to keep ticket keys and related project data consistent.')
    ).toBeInTheDocument();

    await user.click(sidebar.getByRole('button', { name: 'Add Label' }));
    await user.click(screen.getByLabelText('Experience'));
    expect(mockAssignLabel).toHaveBeenCalledWith('ticket-1', 'domain-2');

    await user.selectOptions(sidebar.getByLabelText('Select ticket cycle'), 'cycle-2');
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

  it('copies sidebar utility values for ticket link, branch name, markdown description, and ticket key', async () => {
    const user = userEvent.setup();
    renderTicketDetail({
      activeTicket: {
        ...activeTicket,
        title: '***',
        description: '',
      },
    });

    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const toastSpy = vi.spyOn(toast, 'show').mockImplementation(() => 'mock-toast-id');

    const sidebar = within(screen.getByTestId('desktop-sidebar'));

    await user.click(sidebar.getByRole('button', { name: 'Copy Ticket Link' }));
    expect(writeTextSpy).toHaveBeenCalledWith('https://tickets.placeholder.local/GRA-101');
    expect(toastSpy).toHaveBeenCalledWith('Ticket link copied', 'success');
    expect(sidebar.getByRole('button', { name: 'Copy Branch Name' })).toBeInTheDocument();

    await user.click(sidebar.getByRole('button', { name: 'Copy Branch Name' }));
    expect(writeTextSpy).toHaveBeenCalledWith('feature/gra-101-update-ticket');
    expect(toastSpy).toHaveBeenCalledWith('Branch name copied', 'success');

    await user.click(sidebar.getByRole('button', { name: 'Copy as Markdown' }));
    expect(writeTextSpy).toHaveBeenCalledWith('');
    expect(toastSpy).toHaveBeenCalledWith('Description copied', 'success');
  });

  it('displays the ticket key in the right sidebar and handles comment actions dropdown/inline editing/deletion', async () => {
    const user = userEvent.setup();
    const { props } = renderTicketDetail();
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const toastSpy = vi.spyOn(toast, 'show').mockImplementation(() => 'mock-toast-id');

    const sidebar = within(screen.getByTestId('desktop-sidebar'));

    await user.click(sidebar.getByRole('button', { name: 'Copy Ticket Link' }));
    expect(writeTextSpy).toHaveBeenCalledWith('https://tickets.placeholder.local/GRA-101');
    expect(toastSpy).toHaveBeenCalledWith('Ticket link copied', 'success');

  const generatedBranchName = 'feature/gra-101-fix-sync-retries';
  expect(sidebar.getByRole('button', { name: 'Copy Branch Name' })).toBeInTheDocument();

    // Copy Link button removed — link is now the anchor icon only

    await user.click(sidebar.getByRole('button', { name: 'Copy Branch Name' }));
    expect(writeTextSpy).toHaveBeenCalledWith(generatedBranchName);
    expect(toastSpy).toHaveBeenCalledWith('Branch name copied', 'success');

    await user.click(sidebar.getByRole('button', { name: 'Copy as Markdown' }));
    expect(writeTextSpy).toHaveBeenCalledWith('Retry the event stream after disconnects.');
    expect(toastSpy).toHaveBeenCalledWith('Description copied', 'success');

    // Verify Ticket Key Display in attributes panel
    const sidebarKeyTitle = sidebar.getByText('Ticket Key');
    expect(sidebarKeyTitle).toBeInTheDocument();
    
    const sidebarKeyVal = sidebar.getByText('GRA-101');
    expect(sidebarKeyVal).toBeInTheDocument();

    // Copy Ticket Key button removed — no action here

    // Verify Comment Options dropdown trigger exists
    const commentOptionsBtn = screen.getByRole('button', { name: 'Comment options' });
    expect(commentOptionsBtn).toBeInTheDocument();

    // Dropdown is not visible before opening
    expect(screen.queryByRole('button', { name: 'Grab Link' })).not.toBeInTheDocument();
    
    // Open dropdown
    await user.click(commentOptionsBtn);
    expect(screen.getByRole('button', { name: 'Grab Link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Markdown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Comment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Comment' })).toBeInTheDocument();

    // Click Grab Link — dropdown closes
    await user.click(screen.getByRole('button', { name: 'Grab Link' }));
    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('#comment-comment-1'));
    expect(screen.queryByRole('button', { name: 'Grab Link' })).not.toBeInTheDocument();

    // Open dropdown again to test copy markdown
    await user.click(commentOptionsBtn);
    await user.click(screen.getByRole('button', { name: 'Copy Markdown' }));
    expect(writeTextSpy).toHaveBeenCalledWith('PR is ready for review.');
    expect(screen.queryByRole('button', { name: 'Copy Markdown' })).not.toBeInTheDocument();

    // Open dropdown again to test inline editing
    await user.click(commentOptionsBtn);
    await user.click(screen.getByRole('button', { name: 'Edit Comment' }));
    
    // Dropdown closes; inline edit textarea shown with the comment body
    expect(screen.queryByRole('button', { name: 'Edit Comment' })).not.toBeInTheDocument();
    const commentEditInput = screen.getByDisplayValue('PR is ready for review.');
    await user.clear(commentEditInput);
    await user.type(commentEditInput, 'PR is approved now.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    
    await waitFor(() => {
      expect(props.onUpdateComment).toHaveBeenCalledWith('ticket-1', 'comment-1', 'PR is approved now.');
    });

    // Open dropdown again to test deletion flow — should show confirmation overlay, not window.confirm
    await user.click(commentOptionsBtn);
    await user.click(screen.getByRole('button', { name: 'Delete Comment' }));

    // Overlay should appear with title and action buttons
    expect(screen.getByText('Delete this comment?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    // Confirm deletion via the overlay button (there are now two "Delete Comment" buttons rendered,
    // the second one is inside the overlay)
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete Comment' });
    await user.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(props.onDeleteComment).toHaveBeenCalledWith('ticket-1', 'comment-1');
    });

    // Overlay should close after confirmation
    await waitFor(() => {
      expect(screen.queryByText('Delete this comment?')).not.toBeInTheDocument();
    });
  });

  it('shows parent reference when active ticket is a sub-ticket and navigates on click', async () => {
    const user = userEvent.setup();
    const parentTicket = {
      ...activeTicket,
      id: 'ticket-0',
      key: 'GRA-100',
      title: 'Parent Ticket Title',
      parentId: null,
    };

    const childTicket = {
      ...activeTicket,
      id: 'ticket-4',
      key: 'GRA-104',
      title: 'Child Ticket',
      parentId: 'ticket-0',
    };

    const { props } = renderTicketDetail({ activeTicket: childTicket, parentTicket, onSelectTicket: vi.fn() });

    expect(screen.getByText('Sub ticket of')).toBeInTheDocument();
    const parentBtn = screen.getByRole('button', { name: 'GRA-100 - Parent Ticket Title' });
    await user.click(parentBtn);
    expect(props.onSelectTicket).toHaveBeenCalledWith(parentTicket);
  });
});
