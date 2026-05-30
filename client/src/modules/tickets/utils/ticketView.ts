import type { Cycle, Domain, Project, Ticket, User } from '../../../context/TicketContext';

export interface TicketFilters {
  status: string;
  priority: string;
  projectId: string;
  domainId: string;
  cycleId: string;
  assigneeId: string;
  search: string;
}

export type TicketListSort = 'created' | 'domain' | 'newest' | 'oldest' | 'priority_desc' | 'priority_asc' | 'updated_desc' | 'updated_asc';

export type TicketsByStatus = Record<Ticket['status'], Ticket[]>;

export const BOARD_COLUMNS: Array<{ id: Ticket['status']; title: string; color: string }> = [
  { id: 'backlog', title: 'Backlog', color: '#71717a' },
  { id: 'todo', title: 'Todo', color: '#3b82f6' },
  { id: 'in_progress', title: 'In Progress', color: '#f59e0b' },
  { id: 'in_review', title: 'In Review', color: '#aa3bff' },
  { id: 'done', title: 'Done', color: '#10b981' },
  { id: 'canceled', title: 'Canceled', color: '#ef4444' },
];

// Order used specifically for the list (non-board) ticket view. This presents a
// linear workflow progression: In Review -> In Progress -> Todo -> Backlog -> Done
export const LIST_STATUS_ORDER: Ticket['status'][] = [
  'in_review',
  'in_progress',
  'todo',
  'backlog',
  'done',
  'canceled',
];

export function filterTickets(tickets: Ticket[], filters: TicketFilters): Ticket[] {
  return tickets.filter((ticket) => {
    if (filters.status && ticket.status !== filters.status) return false;
    if (filters.priority && ticket.priority !== filters.priority) return false;
    if (filters.projectId && ticket.projectId !== filters.projectId) return false;
    if (filters.domainId && ticket.domainId !== filters.domainId) return false;
    if (filters.cycleId && ticket.cycleId !== filters.cycleId) return false;
    if (filters.assigneeId && ticket.assigneeId !== filters.assigneeId) return false;

    if (filters.search) {
      const searchLower = filters.search.trim().toLowerCase();
      const normalizedSearch = searchLower.replace(/[^a-z0-9]+/g, '');
      const hasNormalizedSearch = normalizedSearch.length > 0;

      const title = ticket.title?.toLowerCase() ?? '';
      const key = ticket.key?.toLowerCase() ?? '';
      const desc = ticket.description?.toLowerCase() ?? '';
      const branch = ticket.branchName?.toLowerCase() ?? '';

      const titleMatch = title.includes(searchLower) || (hasNormalizedSearch && title.replace(/[^a-z0-9]+/g, '').includes(normalizedSearch));
      const keyMatch = key.includes(searchLower) || (hasNormalizedSearch && key.replace(/[^a-z0-9]+/g, '').includes(normalizedSearch));
      const descMatch = desc.includes(searchLower) || (hasNormalizedSearch && desc.replace(/[^a-z0-9]+/g, '').includes(normalizedSearch));
      const branchMatch = branch.includes(searchLower) || (hasNormalizedSearch && branch.replace(/[^a-z0-9]+/g, '').includes(normalizedSearch));

      return titleMatch || keyMatch || descMatch || branchMatch;
    }

    return true;
  });
}

export function groupTicketsByStatus(tickets: Ticket[]): TicketsByStatus {
  const groups: TicketsByStatus = {
    backlog: [],
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
    canceled: [],
  };

  tickets.forEach((ticket) => {
    if (groups[ticket.status]) {
      groups[ticket.status].push(ticket);
    } else {
      console.warn(`Encountered unknown ticket status "${ticket.status}" for ticket ${ticket.id}. Falling back to 'todo'.`);
      groups['todo'].push(ticket);
    }
  });

  return groups;
}

export function sortTicketsForList(
  tickets: Ticket[],
  domainById: Record<string, Domain>,
  sort: TicketListSort,
): Ticket[] {
  if (sort === 'created') {
    return [...tickets];
  }

  const priorityWeights = { urgent: 4, high: 3, medium: 2, low: 1, no_priority: 0 };

  return [...tickets].sort((first, second) => {
    if (sort === 'domain') {
      const firstDomain = first.domainId ? domainById[first.domainId] : undefined;
      const secondDomain = second.domainId ? domainById[second.domainId] : undefined;

      if (firstDomain && !secondDomain) return -1;
      if (!firstDomain && secondDomain) return 1;
      if (firstDomain && secondDomain) {
        const domainComparison = firstDomain.name.localeCompare(secondDomain.name);
        if (domainComparison !== 0) return domainComparison;
      }
      return first.createdAt.localeCompare(second.createdAt);
    }

    if (sort === 'newest') {
      return second.createdAt.localeCompare(first.createdAt);
    }
    if (sort === 'oldest') {
      return first.createdAt.localeCompare(second.createdAt);
    }

    if (sort === 'priority_desc') {
      const diff = priorityWeights[second.priority] - priorityWeights[first.priority];
      if (diff !== 0) return diff;
      return second.createdAt.localeCompare(first.createdAt);
    }
    if (sort === 'priority_asc') {
      const diff = priorityWeights[first.priority] - priorityWeights[second.priority];
      if (diff !== 0) return diff;
      return first.createdAt.localeCompare(second.createdAt);
    }

    if (sort === 'updated_desc') {
      return (second.updatedAt || second.createdAt).localeCompare(first.updatedAt || first.createdAt);
    }
    if (sort === 'updated_asc') {
      return (first.updatedAt || first.createdAt).localeCompare(second.updatedAt || second.createdAt);
    }

    return first.key.localeCompare(second.key);
  });
}

export function hasActiveTicketFilters(filters: TicketFilters): boolean {
  return Boolean(
    filters.search ||
      filters.priority ||
      filters.status ||
      filters.domainId ||
      filters.cycleId ||
      filters.assigneeId
  );
}

export function getWorkspaceHeaderTitle(
  filters: TicketFilters,
  currentUser: User | null,
  projects: Project[],
  domains: Domain[],
  cycles: Cycle[]
): string {
  if (filters.assigneeId === currentUser?.id) return 'My Issues';

  if (filters.domainId) {
    const domain = domains.find((item) => item.id === filters.domainId);
    return domain ? `${domain.name} Domain` : 'Domain Issues';
  }

  if (filters.cycleId) {
    const cycle = cycles.find((item) => item.id === filters.cycleId);
    return cycle ? cycle.name : 'Cycle Issues';
  }

  if (filters.projectId) {
    const project = projects.find((item) => item.id === filters.projectId);
    return project ? project.name : 'Project Issues';
  }

  return 'All Issues';
}