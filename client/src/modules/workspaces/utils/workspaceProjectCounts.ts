import type { Ticket } from '../../../context/TicketContextContext';

export interface WorkspaceProjectCounts {
  myIssues: number;
  activeProjectIssues: number;
  labels: Record<string, number>;
  cycles: Record<string, number>;
}

interface WorkspaceProjectReference {
  id: string;
}

const EMPTY_TICKETS: readonly Ticket[] = [];
const projectTicketCountsCache = new WeakMap<readonly Ticket[], Map<string, WorkspaceProjectCounts>>();

function createEmptyWorkspaceProjectCounts(): WorkspaceProjectCounts {
  return {
    myIssues: 0,
    activeProjectIssues: 0,
    labels: {},
    cycles: {},
  };
}

function computeWorkspaceProjectCounts(
  projectTickets: readonly Ticket[],
  projectId: string,
  currentUserId?: string
): WorkspaceProjectCounts {
  const counts = createEmptyWorkspaceProjectCounts();

  for (const ticket of projectTickets) {
    if (ticket.projectId && ticket.projectId !== projectId) {
      continue;
    }
    if (ticket.status === 'done' || ticket.status === 'canceled') {
      continue;
    }

    if (ticket.labelIds?.length) {
      for (const labelId of ticket.labelIds) {
        counts.labels[labelId] = (counts.labels[labelId] ?? 0) + 1;
      }
    }

    if (ticket.cycleId) {
      counts.cycles[ticket.cycleId] = (counts.cycles[ticket.cycleId] ?? 0) + 1;
    }

    counts.myIssues += ticket.assigneeId === currentUserId ? 1 : 0;
    counts.activeProjectIssues += 1;
  }

  return counts;
}

function getCachedWorkspaceProjectCounts(
  projectTickets: readonly Ticket[],
  projectId: string,
  currentUserId?: string
): WorkspaceProjectCounts {
  const userCacheKey = `${projectId}:${currentUserId ?? ''}`;
  let cacheForTickets = projectTicketCountsCache.get(projectTickets);

  if (!cacheForTickets) {
    cacheForTickets = new Map<string, WorkspaceProjectCounts>();
    projectTicketCountsCache.set(projectTickets, cacheForTickets);
  }

  const cachedCounts = cacheForTickets.get(userCacheKey);
  if (cachedCounts) {
    return cachedCounts;
  }

  const computedCounts = computeWorkspaceProjectCounts(projectTickets, projectId, currentUserId);
  cacheForTickets.set(userCacheKey, computedCounts);
  return computedCounts;
}

export function createWorkspaceProjectCounts(
  projects: readonly WorkspaceProjectReference[],
  getProjectTickets: (projectId: string) => readonly Ticket[] | undefined,
  currentUserId?: string
): Record<string, WorkspaceProjectCounts> {
  const countsByProject: Record<string, WorkspaceProjectCounts> = {};

  for (const project of projects) {
    const projectTickets = getProjectTickets(project.id) ?? EMPTY_TICKETS;
    countsByProject[project.id] = getCachedWorkspaceProjectCounts(projectTickets, project.id, currentUserId);
  }

  return countsByProject;
}
