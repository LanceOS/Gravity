import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspacePage } from '../../pages/WorkspacePage/WorkspacePage.tsx';
import type { Cycle, Domain, Project, Ticket } from '../../context/TicketContext.tsx';

type TicketBoardMockProps = {
};

type TicketListMockProps = {
  filteredCount: number;
};

type TicketDetailMockProps = {
  activeTicket: {
    title: string;
  };
  subtasks: unknown[];
  completedSubtasks: number;
  subtaskProgressPercent: number;
};

vi.mock('../../modules/tickets', () => ({
  TicketBoard: () => (
    <div>
      <div>TicketBoard Mock</div>
    </div>
  ),
  TicketFilterBar: ({
    hasActiveFilters,
    onClearFilters,
  }: {
    hasActiveFilters: boolean;
    onClearFilters: () => void;
  }) =>
    hasActiveFilters ? (
      <button type="button" onClick={onClearFilters}>
        Clear board filters
      </button>
    ) : null,
  TicketList: ({ filteredCount }: TicketListMockProps) => (
    <div>{`TicketList ${filteredCount}`}</div>
  ),
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
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const baseProps: Parameters<typeof WorkspacePage>[0] = {
    activeTicket: null,
    activeView: 'board' as const,
    currentUser,
    cycles: [cycle],
    labels: [domain],
    filters: {
      search: '',
      priority: '',
      status: '',
      projectId: '',
      labels: [] as string[],
      cycleId: '',
      assigneeId: '',
    },
    listSort: 'created' as const,
    projects: [project],
    tickets: [ticket, doneTicket, subtaskOpen, subtaskDone],
    users: [currentUser],
    onOpenCreateTicket: vi.fn(),
    onOpenProjectManager: vi.fn(),
    onSelectTicket: vi.fn(),
    onSetFilters: vi.fn(),
    onSetListSort: vi.fn(),
    onSetView: vi.fn(),
    onUpdateTicket: vi.fn().mockResolvedValue(undefined),
  };

  const props = { ...baseProps, ...overrides };

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/workspaces/workspace-1/projects/project-1/tickets']}>
          <WorkspacePage {...props} />
        </MemoryRouter>
      </QueryClientProvider>
    ),
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

  it('prompts team workspaces to create their first team when no projects exist', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspacePage({ projects: [], tickets: [], isTeamWorkspace: true });

    expect(screen.getByText('Create your first team')).toBeInTheDocument();
    expect(screen.queryByText('Manage Projects')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Team' }));
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
        labels: [],
        cycleId: '',
        assigneeId: '',
      },
      tickets: [ticket, doneTicket],
    });

    expect(screen.getByText('Gravity Core')).toBeInTheDocument();
    expect(screen.getByText('TicketBoard Mock')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(props.onSetView).toHaveBeenCalledWith('list');

    await user.click(screen.getByRole('button', { name: 'Clear board filters' }));
    expect(props.onSetFilters).toHaveBeenCalledWith({
      search: '',
      priority: '',
      status: '',
      projectId: 'project-1',
      labels: [],
      domainId: '',
      cycleId: '',
      assigneeId: '',
    });
  });

  it('shows cycle-scoped headers and clears cycle and assignee filters together', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspacePage({
      filters: {
        search: '',
        priority: '',
        status: '',
        projectId: 'project-1',
        labels: [],
        cycleId: 'cycle-1',
        assigneeId: 'user-2',
      },
    });

    expect(screen.getByText('Sprint 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear board filters' }));
    expect(props.onSetFilters).toHaveBeenCalledWith({
      search: '',
      priority: '',
      status: '',
      projectId: 'project-1',
      labels: [],
      domainId: '',
      cycleId: '',
      assigneeId: '',
    });
  });

  it('renders the timeline view with clickable task events', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspacePage({
      activeView: 'timeline',
      viewModeLocked: true,
      tickets: [ticket, doneTicket],
    });

    expect(screen.getByText('Recent task activity')).toBeInTheDocument();
    expect(screen.getByText('2 tasks')).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'View mode' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /GRA-1 Fix billing edge case/ }));
    expect(props.onSelectTicket).toHaveBeenCalledWith(ticket);
  });
});
