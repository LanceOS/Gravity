import type { Cycle, Label, Project, Ticket, User } from '../../../context/TicketContext';
import { normalizeSearchTerm, normalizeSearchToken } from '../../../utils/search';
import { BOARD_COLUMNS, LIST_STATUS_ORDER } from '../../../utils/ticketOptions';

export interface TicketFilters {
  status: string;
  priority: string;
  projectId: string;
  labelId?: string;
  domainId?: string;
  labels?: string[];
  labelMode?: 'all' | 'any';
  cycleId: string;
  assigneeId: string;
  search: string;
}

export type TicketListSort =
  | 'created'
  | 'label'
  | 'newest'
  | 'newest_urgent'
  | 'oldest'
  | 'priority_desc'
  | 'priority_asc'
  | 'updated_desc'
  | 'updated_asc';

export type TicketsByStatus = Record<Ticket['status'], Ticket[]>;

export { BOARD_COLUMNS, LIST_STATUS_ORDER };

function parseDateForSort(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function compareDateDescending(first: string, second: string): number {
  const firstTime = parseDateForSort(first);
  const secondTime = parseDateForSort(second);

  if (firstTime !== null && secondTime !== null) {
    return secondTime - firstTime;
  }

  return second.localeCompare(first);
}

function compareDateAscending(first: string, second: string): number {
  const firstTime = parseDateForSort(first);
  const secondTime = parseDateForSort(second);

  if (firstTime !== null && secondTime !== null) {
    return firstTime - secondTime;
  }

  return first.localeCompare(second);
}

export function filterTickets(tickets: Ticket[], filters: TicketFilters): Ticket[] {
  const selectedLabelId = filters.labelId ?? filters.domainId;
  const statusFilters = filters.status
    ? new Set(filters.status.split(',').map((status) => status.trim()).filter(Boolean))
    : null;
  const priorityFilters = filters.priority
    ? new Set(filters.priority.split(',').map((priority) => priority.trim()).filter(Boolean))
    : null;
  const normalizedSearch = normalizeSearchTerm(filters.search);
  const normalizedSearchToken = normalizedSearch.length > 0 ? normalizeSearchToken(normalizedSearch) : '';
  const normalizedLabelIds = (filters.labels || []).filter(Boolean);
  const useAllLabelMode = (filters.labelMode || 'any') === 'all';
  const useLabelsFilter = normalizedLabelIds.length > 0;

  return tickets.filter((ticket) => {
    if (statusFilters && !statusFilters.has(ticket.status)) {
      return false;
    }
    if (priorityFilters && !priorityFilters.has(ticket.priority)) {
      return false;
    }
    if (filters.projectId && ticket.projectId !== filters.projectId) return false;

    if (selectedLabelId && !ticket.labelIds?.includes(selectedLabelId)) return false;

    if (useLabelsFilter) {
      const mode = filters.labelMode || 'any';
      if (mode === 'all' || useAllLabelMode) {
        const hasAll = normalizedLabelIds.every((lId) => ticket.labelIds?.includes(lId));
        if (!hasAll) return false;
      } else {
        const hasAny = normalizedLabelIds.some((lId) => ticket.labelIds?.includes(lId));
        if (!hasAny) return false;
      }
    }
    
    if (filters.cycleId && ticket.cycleId !== filters.cycleId) return false;
    if (filters.assigneeId && ticket.assigneeId !== filters.assigneeId) return false;

    if (normalizedSearch) {
      const title = ticket.title?.toLowerCase() ?? '';
      const key = ticket.key?.toLowerCase() ?? '';
      const desc = ticket.description?.toLowerCase() ?? '';
      const branch = ticket.branchName?.toLowerCase() ?? '';

      const titleMatch = title.includes(normalizedSearch);
      const keyMatch = key.includes(normalizedSearch);
      const descMatch = desc.includes(normalizedSearch);
      const branchMatch = branch.includes(normalizedSearch);

      if (!titleMatch && !keyMatch && !descMatch && !branchMatch) {
        if (!normalizedSearchToken.length) {
          return false;
        }

        const normalizedTitle = title.replace(/[^a-z0-9]+/g, '');
        const normalizedKey = key.replace(/[^a-z0-9]+/g, '');
        const normalizedDesc = desc.replace(/[^a-z0-9]+/g, '');
        const normalizedBranch = branch.replace(/[^a-z0-9]+/g, '');

        const normalizedMatch = normalizedTitle.includes(normalizedSearchToken)
          || normalizedKey.includes(normalizedSearchToken)
          || normalizedDesc.includes(normalizedSearchToken)
          || normalizedBranch.includes(normalizedSearchToken);

        if (!normalizedMatch) return false;
      }

      return true;
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
  labelById: Record<string, Label>,
  sort: TicketListSort,
): Ticket[] {
  if (sort === 'created') {
    return [...tickets];
  }

  const priorityWeights = { urgent: 4, high: 3, medium: 2, low: 1, no_priority: 0 };

  return [...tickets].sort((first, second) => {
    if (sort === 'label') {
      const firstLabel = first.labelIds?.[0] ? labelById[first.labelIds[0]] : undefined;
      const secondLabel = second.labelIds?.[0] ? labelById[second.labelIds[0]] : undefined;

      if (firstLabel && !secondLabel) return -1;
      if (!firstLabel && secondLabel) return 1;
      if (firstLabel && secondLabel) {
        const labelComparison = firstLabel.name.localeCompare(secondLabel.name);
        if (labelComparison !== 0) return labelComparison;
      }
      return compareDateAscending(first.createdAt, second.createdAt);
    }

    if (sort === 'newest') {
      return compareDateDescending(first.createdAt, second.createdAt);
    }
    if (sort === 'newest_urgent') {
      const priorityDiff = priorityWeights[second.priority] - priorityWeights[first.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return compareDateDescending(first.createdAt, second.createdAt);
    }
    if (sort === 'oldest') {
      return compareDateAscending(first.createdAt, second.createdAt);
    }

    if (sort === 'priority_desc') {
      const diff = priorityWeights[second.priority] - priorityWeights[first.priority];
      if (diff !== 0) return diff;
      return compareDateDescending(first.createdAt, second.createdAt);
    }
    if (sort === 'priority_asc') {
      const diff = priorityWeights[first.priority] - priorityWeights[second.priority];
      if (diff !== 0) return diff;
      return compareDateAscending(first.createdAt, second.createdAt);
    }

    if (sort === 'updated_desc') {
      return compareDateDescending(
        first.updatedAt || first.createdAt,
        second.updatedAt || second.createdAt
      );
    }
    if (sort === 'updated_asc') {
      return compareDateAscending(
        first.updatedAt || first.createdAt,
        second.updatedAt || second.createdAt
      );
    }

    return first.key.localeCompare(second.key);
  });
}

export function hasActiveTicketFilters(filters: TicketFilters): boolean {
  return Boolean(
    filters.search ||
      filters.priority ||
      filters.status ||
      filters.labelId ||
      filters.domainId ||
      (filters.labels && filters.labels.length > 0) ||
      filters.cycleId ||
      filters.assigneeId
  );
}

export function getWorkspaceHeaderTitle(
  filters: TicketFilters,
  currentUser: User | null,
  projects: Project[],
  labels: Label[],
  cycles: Cycle[]
): string {
  if (filters.assigneeId === currentUser?.id) return 'My Issues';

  if (filters.labels && filters.labels.length > 0) {
    const labelNameById = new Map(labels.map((label) => [label.id, label]));
    const labelNames = filters.labels
      .map((lId) => labelNameById.get(lId)?.name)
      .filter(Boolean);
    if (labelNames.length > 0) {
      return `${labelNames.join(', ')} Label${labelNames.length > 1 ? 's' : ''}`;
    }
    return 'Label Issues';
  }

  if (filters.labelId || filters.domainId) {
    return 'Label Issues';
  }

  if (filters.cycleId) {
    const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
    const cycle = cycleById.get(filters.cycleId);
    return cycle ? cycle.name : 'Cycle Issues';
  }

  if (filters.projectId) {
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const project = projectById.get(filters.projectId);
    return project ? project.name : 'Project Issues';
  }

  return 'All Issues';
}
