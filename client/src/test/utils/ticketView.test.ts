import { describe, expect, it } from 'vitest';
import { getWorkspaceHeaderTitle, hasActiveTicketFilters, type TicketFilters } from '../../modules/tickets/utils/ticketView';

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

const domain = {
  id: 'domain-1',
  name: 'Platform',
  color: '#3b82f6',
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
  domainId: '',
  cycleId: '',
  assigneeId: '',
};

describe('ticketView utils', () => {
  it('treats cycle and assignee filters as active filters', () => {
    expect(hasActiveTicketFilters({ ...baseFilters, cycleId: 'cycle-1' })).toBe(true);
    expect(hasActiveTicketFilters({ ...baseFilters, assigneeId: 'user-2' })).toBe(true);
    expect(hasActiveTicketFilters(baseFilters)).toBe(false);
  });

  it('prioritizes domain and cycle titles over the current project context', () => {
    expect(
      getWorkspaceHeaderTitle(
        { ...baseFilters, domainId: 'domain-1' },
        currentUser,
        [project],
        [domain],
        [cycle],
      )
    ).toBe('Platform Domain');

    expect(
      getWorkspaceHeaderTitle(
        { ...baseFilters, cycleId: 'cycle-1' },
        currentUser,
        [project],
        [domain],
        [cycle],
      )
    ).toBe('Sprint 1');
  });
});