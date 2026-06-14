import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

vi.mock('../../modules/notes/components/NotesList', () => ({
  NotesList: ({ sortDirection }: { sortDirection: 'desc' | 'asc' }) => (
    <div>{`NotesList ${sortDirection}`}</div>
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
    pathname: '/workspaces/workspace-1',
    projects: [project],
    tickets: [ticket, doneTicket, subtaskOpen, subtaskDone],
    users: [currentUser],
    onOpenCreateTicket: vi.fn(),
    onOpenProjectManager: vi.fn(),
    onOpenTeamManager: vi.fn(),
    onOpenTeamProjectManager: vi.fn(),
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
    const { props } = renderWorkspacePage({
      projects: [],
      tickets: [],
      isTeamWorkspace: true,
      pathname: '/workspaces/workspace-1',
      hasTeams: false,
    });

    expect(screen.getByText('Create your first team')).toBeInTheDocument();
    expect(screen.queryByText('Manage Projects')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Team' }));
    expect(props.onOpenTeamManager).toHaveBeenCalledTimes(1);
  });

  it('prompts team-scoped routes to create a project when no projects exist', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspacePage({
      projects: [],
      tickets: [],
      isTeamWorkspace: true,
      pathname: '/workspaces/workspace-1/teams/team-1/tasks',
    });

    expect(screen.getByText('No projects in this team yet')).toBeInTheDocument();
    expect(
      screen.getByText('Create a project for this team to start organizing work, tickets, and milestones.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Project' }));
    expect(props.onOpenTeamProjectManager).toHaveBeenCalledTimes(1);
  });

  it('prompts team workspaces with teams but no tasks to manage projects', async () => {
    const user = userEvent.setup();
    const { props } = renderWorkspacePage({
      projects: [],
      tickets: [],
      isTeamWorkspace: true,
      pathname: '/workspaces/workspace-1',
      hasTeams: true,
    });

    expect(screen.getByText('No tasks in this workspace yet')).toBeInTheDocument();
    expect(
      screen.getByText('Teams and projects are ready, but there are no tasks yet. Create a project or open Manage Projects to start tracking work.')
    ).toBeInTheDocument();

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
      labelId: '',
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
      labelId: '',
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

  it('allows filtering by project through context menu', async () => {
    const user = userEvent.setup();
    const { props, container } = renderWorkspacePage({
      activeView: 'list',
      tickets: [ticket],
      projects: [
        { id: 'project-1', name: 'Gravity Core', description: '', key: 'GRA', status: 'active', workspaceId: 'ws-1' },
        { id: 'project-2', name: 'Orbit Delivery', description: '', key: 'ORB', status: 'active', workspaceId: 'ws-1' },
      ],
    });

    const listElement = screen.getByText(/TicketList/);
    fireEvent.contextMenu(listElement);

    const filterByOption = await screen.findByText('Filter By');
    await user.hover(filterByOption);

    const projectOption = await screen.findByText('Project');
    await user.hover(projectOption);

    const project1Option = await screen.findByText('Gravity Core');
    await user.click(project1Option);

    expect(props.onSetFilters).toHaveBeenCalledWith({
      ...props.filters,
      projectId: 'project-1',
    });
  });

  it('allows sorting notes through context menu in notes view', async () => {
    const user = userEvent.setup();
    const { container } = renderWorkspacePage({
      activeContext: 'notes',
      tickets: [],
      projects: [project],
    });

    const listElement = screen.getByText(/NotesList/);
    fireEvent.contextMenu(listElement);

    const filterByOption = await screen.findByText('Filter By');
    await user.hover(filterByOption);

    const oldestOption = await screen.findByText('Oldest');
    await user.click(oldestOption);

    expect(screen.getByText('NotesList asc')).toBeInTheDocument();
    
    fireEvent.contextMenu(listElement);
    const filterByOption2 = await screen.findByText('Filter By');
    await user.hover(filterByOption2);

    const newestOption = await screen.findByText('Newest');
    await user.click(newestOption);

    expect(screen.getByText('NotesList desc')).toBeInTheDocument();
  });

  it('allows creating a new note through context menu in notes view', async () => {
    const user = userEvent.setup();
    const onSelectNote = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'note-new-123', title: 'Untitled Note' }),
    } as Response);

    const { container } = renderWorkspacePage({
      activeContext: 'notes',
      tickets: [],
      projects: [project],
      filters: {
        search: '',
        priority: '',
        status: '',
        projectId: 'project-1',
        labels: [],
        cycleId: '',
        assigneeId: '',
      },
      onSelectNote,
    });

    const listElement = screen.getByText(/NotesList/);
    fireEvent.contextMenu(listElement);

    const createNoteOption = await screen.findByRole('menuitem', { name: 'Create New Note' });
    await user.click(createNoteOption);

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/v1/notes',
        expect.objectContaining({
          method: 'POST',
        })
      )
    );
    await waitFor(() => expect(onSelectNote).toHaveBeenCalledWith('note-new-123'));

    fetchSpy.mockRestore();
  });
});
