import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacePage } from '../../pages/WorkspacePage/WorkspacePage.tsx';
import type { Cycle, Domain, Project, Ticket } from '../../context/TicketContext.tsx';

type TicketBoardMockProps = {
  filteredCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
};

type TicketListMockProps = {
  filteredCount: number;
  totalCount: number;
  listSort: string;
};

type TicketDetailMockProps = {
  activeTicket: {
    title: string;
  };
  subtasks: unknown[];
  completedSubtasks: number;
  subtaskProgressPercent: number;
};

vi.mock('../../components/TicketBoard', () => ({
  TicketBoard: ({ filteredCount, totalCount, hasActiveFilters }: TicketBoardMockProps) => (
    <div>
      <div>{`TicketBoard ${filteredCount}/${totalCount} ${hasActiveFilters ? 'filtered' : 'unfiltered'}`}</div>
    </div>
  ),
}));

vi.mock('../../components/TicketFilterBar', () => ({
  TicketFilterBar: ({ onClearFilters }: { onClearFilters: () => void }) => (
    <button type="button" onClick={onClearFilters}>
      Clear board filters
    </button>
  ),
}));

vi.mock('../../components/TicketList', () => ({
  TicketList: ({ filteredCount, totalCount, listSort }: TicketListMockProps) => (
    <div>{`TicketList ${filteredCount}/${totalCount} ${listSort}`}</div>
  ),
}));

vi.mock('../../components/TicketDetail', () => ({
  TicketDetail: ({ activeTicket, subtasks, completedSubtasks, subtaskProgressPercent }: TicketDetailMockProps) => (
    <div>{`TicketDetail ${activeTicket.title} ${subtasks.length} ${completedSubtasks} ${Math.round(subtaskProgressPercent)}`}</div>
  ),
}));

const currentUser = {
  id: 'user-1',
  name: 'Casey Carter',
  email: 'casey@example.com',
  avatar: '',
  role: 'owner',
  tutorial_completed: 1,
};

const project: Project = {
  id: 'project-1',
  name: 'Gravity Core',
  key: 'GRA',
  description: 'Primary project',
  status: 'active',
  workspaceId: 'workspace-1',
};

const domain: Domain = {
  id: 'domain-1',
  name: 'Platform',
  color: '#3b82f6',
};

const cycle: Cycle = {
  id: 'cycle-1',
  name: 'Sprint 1',
  startDate: '2026-05-01T00:00:00.000Z',
  endDate: '2026-05-15T00:00:00.000Z',
  completed: 0,
};

const ticket: Ticket = {
  id: 'ticket-1',
  key: 'GRA-1',
  title: 'Fix billing edge case',
  description: 'Investigate billing workflow for duplicate events.',
  status: 'todo',
  priority: 'high',
  projectId: 'project-1',
  domainId: 'domain-1',
  cycleId: 'cycle-1',
  assigneeId: 'user-1',
  parentId: null,
  prStatus: 'none',
  prUrl: null,
  createdAt: '2026-05-01T10:00:00.000Z',
  updatedAt: '2026-05-01T10:00:00.000Z',
};

const doneTicket: Ticket = {
  id: 'ticket-2',
  key: 'GRA-2',
  title: 'Polish onboarding copy',
  description: 'Review the first-run marketing copy.',
  status: 'done',
  priority: 'low',
  projectId: 'project-1',
  domainId: null,
  cycleId: null,
  assigneeId: null,
  parentId: null,
  prStatus: 'none',
  prUrl: null,
  createdAt: '2026-05-02T10:00:00.000Z',
  updatedAt: '2026-05-02T10:00:00.000Z',
};

const subtaskOpen: Ticket = {
  ...ticket,
  id: 'ticket-3',
  key: 'GRA-3',
  title: 'Verify webhook replay',
  parentId: 'ticket-1',
  status: 'todo',
};

const subtaskDone: Ticket = {
  ...ticket,
  id: 'ticket-4',
  key: 'GRA-4',
  title: 'Ship replay fix',
  parentId: 'ticket-1',
  status: 'done',
};

function renderWorkspacePage(overrides: Partial<Parameters<typeof WorkspacePage>[0]> = {}) {
  const baseProps: Parameters<typeof WorkspacePage>[0] = {
    activeTicket: null,
    activeView: 'board' as const,
    comments: [],
    currentUser,
    cycles: [cycle],
    domains: [domain],
    filters: {
      search: '',
      priority: '',
      status: '',
      projectId: '',
      domainId: '',
      cycleId: '',
      assigneeId: '',
    },
    listSort: 'created' as const,
    projects: [project],
    tickets: [ticket, doneTicket, subtaskOpen, subtaskDone],
    users: [currentUser],
    onAddComment: vi.fn().mockResolvedValue(undefined),
    onDeleteTicket: vi.fn().mockResolvedValue(undefined),
    onOpenCreateSubtask: vi.fn(),
    onOpenCreateTicket: vi.fn(),
    onOpenProjectManager: vi.fn(),
    onSelectTicket: vi.fn(),
    onSetFilters: vi.fn(),
    onSetListSort: vi.fn(),
    onSetView: vi.fn(),
    onUpdateTicket: vi.fn().mockResolvedValue(undefined),
    onUpdateComment: vi.fn().mockResolvedValue(undefined),
    onDeleteComment: vi.fn().mockResolvedValue(undefined),
  };

  const props = { ...baseProps, ...overrides };

  return {
    ...render(<WorkspacePage {...props} />),
    props,
  };
}

describe('WorkspacePage', () => {
  it('renders the empty state when the workspace has no projects', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspacePage({ projects: [], tickets: [] });

    expect(screen.getByText('No projects in this workspace yet')).toBeInTheDocument();
    expect(screen.queryByText('All Issues')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'View mode' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Manage Projects' }));
    expect(props.onOpenProjectManager).toHaveBeenCalledTimes(1);
  });

  it('renders the board view with filtered ticket counts and clears filters', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspacePage({
      filters: {
        search: 'billing',
        priority: '',
        status: '',
        projectId: 'project-1',
        domainId: '',
        cycleId: '',
        assigneeId: '',
      },
      tickets: [ticket, doneTicket],
    });

    expect(screen.getByText('Gravity Core')).toBeInTheDocument();
    expect(screen.getByText('TicketBoard 1/2 filtered')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(props.onSetView).toHaveBeenCalledWith('list');

    await user.click(screen.getByRole('button', { name: 'Clear board filters' }));
    expect(props.onSetFilters).toHaveBeenCalledWith({
      search: '',
      priority: '',
      status: '',
      projectId: 'project-1',
      domainId: '',
      cycleId: '',
      assigneeId: '',
    });
  });

  it('renders the list view and passes subtask progress to the detail panel', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspacePage({
      activeView: 'list',
      activeTicket: ticket,
    });

    expect(screen.getByText('All Issues')).toBeInTheDocument();
    expect(screen.getByText('TicketList 4/4 created')).toBeInTheDocument();
    expect(screen.getByText('TicketDetail Fix billing edge case 2 1 50')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Board' }));
    expect(props.onSetView).toHaveBeenCalledWith('board');
  });
});