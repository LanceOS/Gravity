import type { SidebarProjectSection } from '../types';

export function getProjectCollapsedState(
  collapsedProjects: Record<string, boolean>,
  projectId: string,
  activeProjectId: string,
) {
  return collapsedProjects[projectId] ?? projectId !== activeProjectId;
}

export function getTeamCollapsedState(
  collapsedTeams: Record<string, boolean>,
  teamId: string,
  activeTeamId: string,
) {
  return collapsedTeams[teamId] ?? teamId !== activeTeamId;
}

export function isProjectIssuesView(section: SidebarProjectSection) {
  const { activeProjectId, filters, activeContext } = section;

  return (
    activeContext !== 'notes'
    && filters.projectId === activeProjectId
    && !filters.assigneeId
    && (!filters.labels || filters.labels.length === 0)
    && !filters.cycleId
  );
}

export function isMyIssuesView(section: SidebarProjectSection) {
  const { activeProjectId, currentUser, filters, activeContext } = section;

  return (
    activeContext !== 'notes'
    && filters.projectId === activeProjectId
    && filters.assigneeId === currentUser.id
    && (!filters.labels || filters.labels.length === 0)
    && !filters.cycleId
  );
}

export function isNotesView(section: SidebarProjectSection) {
  return section.activeContext === 'notes';
}
