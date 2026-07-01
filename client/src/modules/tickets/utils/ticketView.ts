import type { Cycle, Label, Project, Ticket, User } from '../../../context/TicketContextContext';
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

interface TicketSearchIndex {
  title: string;
  key: string;
  description: string;
  branchName: string;
  normalizedTitle: string;
  normalizedKey: string;
  normalizedDescription: string;
  normalizedBranchName: string;
}

const ticketSearchCache = new WeakMap<Ticket, TicketSearchIndex>();
const dateParseCache = new Map<string, number | null>();

function getSearchIndex(ticket: Ticket): TicketSearchIndex {
  const cached = ticketSearchCache.get(ticket);
  if (cached) {
    return cached;
  }

  const title = ticket.title.toLowerCase();
  const key = ticket.key.toLowerCase();
  const description = ticket.description.toLowerCase();
  const branchName = ticket.branchName?.toLowerCase() ?? '';

  const index: TicketSearchIndex = {
    title,
    key,
    description,
    branchName,
    normalizedTitle: normalizeSearchToken(title),
    normalizedKey: normalizeSearchToken(key),
    normalizedDescription: normalizeSearchToken(description),
    normalizedBranchName: normalizeSearchToken(branchName),
  };

  ticketSearchCache.set(ticket, index);
  return index;
}

function parseDateForSort(value: string): number | null {
  const cached = dateParseCache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const parsed = Date.parse(value);
  const parsedValue = Number.isNaN(parsed) ? null : parsed;
  dateParseCache.set(value, parsedValue);
  return parsedValue;
}

type DateForSortValue = string | number;

function compareDateDescending(first: DateForSortValue, second: DateForSortValue): number {
  const firstTime = typeof first === 'number' ? first : parseDateForSort(first);
  const secondTime = typeof second === 'number' ? second : parseDateForSort(second);

  if (firstTime !== null && secondTime !== null) {
    return secondTime - firstTime;
  }

  if (typeof first === 'number') {
    return 1;
  }

  if (typeof second === 'number') {
    return -1;
  }

  return second.localeCompare(first);
}

function compareDateAscending(first: DateForSortValue, second: DateForSortValue): number {
  const firstTime = typeof first === 'number' ? first : parseDateForSort(first);
  const secondTime = typeof second === 'number' ? second : parseDateForSort(second);

  if (firstTime !== null && secondTime !== null) {
    return firstTime - secondTime;
  }

  if (typeof first === 'number') {
    return -1;
  }

  if (typeof second === 'number') {
    return 1;
  }

  return first.localeCompare(second);
}

export function filterTickets(tickets: Ticket[], filters: TicketFilters): Ticket[] {
  const selectedLabelId = filters.labelId ?? filters.domainId;
  const hasStatusFilter = Boolean(filters.status);
  const hasPriorityFilter = Boolean(filters.priority);
  const hasProjectFilter = Boolean(filters.projectId);
  const hasLabelIdFilter = Boolean(selectedLabelId);
  const hasDomainFilter = Boolean(filters.domainId);
  const normalizedLabelIds = (filters.labels || []).filter(Boolean);
  const hasLabelsFilter = normalizedLabelIds.length > 0;
  const hasCycleFilter = Boolean(filters.cycleId);
  const hasAssigneeFilter = Boolean(filters.assigneeId);

  if (!hasStatusFilter
    && !hasPriorityFilter
    && !hasProjectFilter
    && !hasLabelIdFilter
    && !hasDomainFilter
    && !hasLabelsFilter
    && !hasCycleFilter
    && !hasAssigneeFilter
    && !normalizeSearchTerm(filters.search)
  ) {
    return tickets;
  }

  const statusFilters = hasStatusFilter
    ? new Set(filters.status.split(',').map((status) => status.trim()).filter(Boolean))
    : null;
  const priorityFilters = hasPriorityFilter
    ? new Set(filters.priority.split(',').map((priority) => priority.trim()).filter(Boolean))
    : null;
  const normalizedSearch = normalizeSearchTerm(filters.search);
  const normalizedSearchToken = normalizedSearch.length > 0 ? normalizeSearchToken(normalizedSearch) : '';
  const labelMatchMode = filters.labelMode || 'any';
  const useAllLabelMode = labelMatchMode === 'all';
  const normalizedLabelSet = hasLabelsFilter ? new Set(normalizedLabelIds) : null;

  return tickets.filter((ticket) => {
    if (statusFilters && !statusFilters.has(ticket.status)) {
      return false;
    }
    if (priorityFilters && !priorityFilters.has(ticket.priority)) {
      return false;
    }
    if (filters.projectId && ticket.projectId !== filters.projectId) return false;

    if (selectedLabelId && !ticket.labelIds?.includes(selectedLabelId)) return false;

    if (hasLabelsFilter && normalizedLabelSet) {
      if (useAllLabelMode) {
        for (const labelId of normalizedLabelSet) {
          if (!ticket.labelIds?.includes(labelId)) {
            return false;
          }
        }
      } else {
        const matchedLabel = ticket.labelIds ? ticket.labelIds.some((labelId) => normalizedLabelSet.has(labelId)) : false;
        if (!matchedLabel) {
          return false;
        }
      }
    }
    
    if (filters.cycleId && ticket.cycleId !== filters.cycleId) return false;
    if (filters.assigneeId && ticket.assigneeId !== filters.assigneeId) return false;

    if (normalizedSearch) {
      const {
        title,
        key,
        description,
        branchName,
        normalizedTitle,
        normalizedKey,
        normalizedDescription,
        normalizedBranchName,
      } = getSearchIndex(ticket);

      const titleMatch = title.includes(normalizedSearch);
      const keyMatch = key.includes(normalizedSearch);
      const descMatch = description.includes(normalizedSearch);
      const branchMatch = branchName.includes(normalizedSearch);

      if (!titleMatch && !keyMatch && !descMatch && !branchMatch) {
        if (!normalizedSearchToken.length) {
          return false;
        }

        const normalizedMatch = normalizedTitle.includes(normalizedSearchToken)
          || normalizedKey.includes(normalizedSearchToken)
          || normalizedDescription.includes(normalizedSearchToken)
          || normalizedBranchName.includes(normalizedSearchToken);

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
    return tickets;
  }

  const priorityWeights = { urgent: 4, high: 3, medium: 2, low: 1, no_priority: 0 };
  const enrichedTickets = tickets.map((ticket) => ({
    ticket,
    createdAtTime: parseDateForSort(ticket.createdAt) ?? ticket.createdAt,
    updatedAtTime: parseDateForSort(ticket.updatedAt || ticket.createdAt) ?? (ticket.updatedAt || ticket.createdAt),
  }));

  const sortedEnriched = enrichedTickets.sort((first, second) => {
    const firstTicket = first.ticket;
    const secondTicket = second.ticket;
    if (sort === 'label') {
      const firstLabel = firstTicket.labelIds?.[0] ? labelById[firstTicket.labelIds[0]] : undefined;
      const secondLabel = secondTicket.labelIds?.[0] ? labelById[secondTicket.labelIds[0]] : undefined;

      if (firstLabel && !secondLabel) return -1;
      if (!firstLabel && secondLabel) return 1;
      if (firstLabel && secondLabel) {
        const labelComparison = firstLabel.name.localeCompare(secondLabel.name);
        if (labelComparison !== 0) return labelComparison;
      }
      return compareDateAscending(first.createdAtTime, second.createdAtTime);
    }

    if (sort === 'newest') {
      return compareDateDescending(first.createdAtTime, second.createdAtTime);
    }
    if (sort === 'newest_urgent') {
      const priorityDiff = priorityWeights[secondTicket.priority] - priorityWeights[firstTicket.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return compareDateDescending(first.createdAtTime, second.createdAtTime);
    }
    if (sort === 'oldest') {
      return compareDateAscending(first.createdAtTime, second.createdAtTime);
    }

    if (sort === 'priority_desc') {
      const diff = priorityWeights[secondTicket.priority] - priorityWeights[firstTicket.priority];
      if (diff !== 0) return diff;
      return compareDateDescending(first.createdAtTime, second.createdAtTime);
    }
    if (sort === 'priority_asc') {
      const diff = priorityWeights[firstTicket.priority] - priorityWeights[secondTicket.priority];
      if (diff !== 0) return diff;
      return compareDateAscending(first.createdAtTime, second.createdAtTime);
    }

    if (sort === 'updated_desc') {
      return compareDateDescending(first.updatedAtTime, second.updatedAtTime);
    }
    if (sort === 'updated_asc') {
      return compareDateAscending(first.updatedAtTime, second.updatedAtTime);
    }

    return firstTicket.key.localeCompare(secondTicket.key);
  });

  return sortedEnriched.map((entry) => entry.ticket);
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
