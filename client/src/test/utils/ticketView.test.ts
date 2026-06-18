import { describe, expect, it } from 'vitest';
import {
  filterTickets,
  getWorkspaceHeaderTitle,
  hasActiveTicketFilters,
  sortTicketsForList,
  type TicketFilters,
} from '../../modules/tickets/utils/ticketView';

const currentUser = {
  id: 'user-1',
  name: 'Casey Carter',
  email: 'casey@example.com',
  avatar: '',
  role: 'owner',
  tutorial_completed: 1,
};

const project = {
  id: 'project-1',
  name: 'Gravity Core',
  key: 'GRA',
  description: 'Primary project',
  status: 'active' as const,
  workspaceId: 'workspace-1',
};

const label = {
  id: 'label-1',
  projectId: 'project-1',
  name: 'Platform',
  color: '#3b82f6',
  description: '',
  sortOrder: 0,
};

const cycle = {
  id: 'cycle-1',
  name: 'Sprint 1',
  startDate: '2026-05-01T00:00:00.000Z',
  endDate: '2026-05-15T00:00:00.000Z',
  completed: 0,
};

const baseFilters: TicketFilters = {
  search: '',
  priority: '',
  status: '',
  projectId: 'project-1',
  labels: [],
  labelMode: 'any',
  cycleId: '',
  assigneeId: '',
};

describe('ticketView utils', () => {
  it('treats cycle and assignee filters as active filters', () => {
    expect(hasActiveTicketFilters({ ...baseFilters, cycleId: 'cycle-1' })).toBe(true);
    expect(hasActiveTicketFilters({ ...baseFilters, assigneeId: 'user-2' })).toBe(true);
    expect(hasActiveTicketFilters(baseFilters)).toBe(false);
  });

  it('prioritizes label and cycle titles over the current project context', () => {
    expect(
      getWorkspaceHeaderTitle(
        { ...baseFilters, labels: ['label-1'] },
        currentUser,
        [project],
        [label],
        [cycle],
      )
    ).toBe('Platform Label');

    expect(
      getWorkspaceHeaderTitle(
        { ...baseFilters, cycleId: 'cycle-1' },
        currentUser,
        [project],
        [label],
        [cycle],
      )
    ).toBe('Sprint 1');
  });

  it('filters tickets by branch name when searching', () => {
    const branchTicket = {
      id: 'ticket-branch-1',
      key: 'GRA-99',
      title: 'Some title',
      description: '',
      status: 'todo',
      priority: 'low',
      projectId: 'project-1',
      labels: [],
      labelIds: [],
      cycleId: '',
      assigneeId: '',
      parentId: null,
      prStatus: 'none',
      prUrl: null,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      branchName: 'feature/GRA-99-new-thing',
    } as any;

    const results = filterTickets([branchTicket], { ...baseFilters, search: 'GRA-99' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('ticket-branch-1');
  });

  it('matches branch/key variants like GRA99 or feature/gra-99', () => {
    const branchTicket = {
      id: 'ticket-branch-2',
      key: 'GRA-100',
      title: 'Some title',
      description: '',
      status: 'todo',
      priority: 'low',
      projectId: 'project-1',
      labels: [],
      labelIds: [],
      cycleId: '',
      assigneeId: '',
      parentId: null,
      prStatus: 'none',
      prUrl: null,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      branchName: 'feature/GRA-100-awesome',
    } as any;

    expect(filterTickets([branchTicket], { ...baseFilters, search: 'GRA100' })).toHaveLength(1);
    expect(filterTickets([branchTicket], { ...baseFilters, search: 'gra-100' })).toHaveLength(1);
    expect(filterTickets([branchTicket], { ...baseFilters, search: 'feature/gra-100' })).toHaveLength(1);
  });

  it('sorts newest_urgent by priority from urgent to low', () => {
    const tickets = [
      {
        id: 'low',
        key: 'GRA-4',
        title: 'Low priority ticket',
        description: '',
        status: 'todo',
        priority: 'low',
        projectId: 'project-1',
        labels: [],
        labelIds: [],
        cycleId: '',
        assigneeId: '',
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'urgent',
        key: 'GRA-1',
        title: 'Urgent ticket',
        description: '',
        status: 'todo',
        priority: 'urgent',
        projectId: 'project-1',
        labels: [],
        labelIds: [],
        cycleId: '',
        assigneeId: '',
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'medium',
        key: 'GRA-3',
        title: 'Medium priority ticket',
        description: '',
        status: 'todo',
        priority: 'medium',
        projectId: 'project-1',
        labels: [],
        labelIds: [],
        cycleId: '',
        assigneeId: '',
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-03T00:00:00.000Z',
        updatedAt: '2026-05-03T00:00:00.000Z',
      },
      {
        id: 'high',
        key: 'GRA-2',
        title: 'High priority ticket',
        description: '',
        status: 'todo',
        priority: 'high',
        projectId: 'project-1',
        labels: [],
        labelIds: [],
        cycleId: '',
        assigneeId: '',
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      },
    ] as any;

    expect(sortTicketsForList(tickets, {}, 'newest_urgent').map((ticket) => ticket.id)).toEqual([
      'urgent',
      'high',
      'medium',
      'low',
    ]);
  });
});
