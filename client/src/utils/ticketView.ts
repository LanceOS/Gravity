import type { Cycle, Domain, Project, Ticket, User } from '../context/TicketContext';

export interface TicketFilters {
  status: string;
  priority: string;
  projectId: string;
  domainId: string;
  cycleId: string;
  assigneeId: string;
  search: string;
}

export type TicketsByStatus = Record<Ticket['status'], Ticket[]>;

export const BOARD_COLUMNS: Array<{ id: Ticket['status']; title: string; color: string }> = [
  { id: 'backlog', title: 'Backlog', color: '#71717a' },
  { id: 'todo', title: 'Todo', color: '#3b82f6' },
  { id: 'in_progress', title: 'In Progress', color: '#f59e0b' },
  { id: 'in_review', title: 'In Review', color: '#aa3bff' },
  { id: 'done', title: 'Done', color: '#10b981' },
  { id: 'canceled', title: 'Canceled', color: '#ef4444' },
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
      const searchLower = filters.search.toLowerCase();
      const titleMatch = ticket.title.toLowerCase().includes(searchLower);
      const keyMatch = ticket.key.toLowerCase().includes(searchLower);
      const descMatch = ticket.description?.toLowerCase().includes(searchLower) || false;
      return titleMatch || keyMatch || descMatch;
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
    groups[ticket.status].push(ticket);
  });

  return groups;
}

export function hasActiveTicketFilters(filters: TicketFilters): boolean {
  return Boolean(
    filters.search ||
      filters.priority ||
      filters.status ||
      filters.projectId ||
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

  if (filters.projectId) {
    const project = projects.find((item) => item.id === filters.projectId);
    return project ? project.name : 'Project Issues';
  }

  if (filters.domainId) {
    const domain = domains.find((item) => item.id === filters.domainId);
    return domain ? `${domain.name} Domain` : 'Domain Issues';
  }

  if (filters.cycleId) {
    const cycle = cycles.find((item) => item.id === filters.cycleId);
    return cycle ? cycle.name : 'Cycle Issues';
  }

  return 'All Issues';
}