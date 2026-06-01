import type { SidebarProjectSection } from '../types';

export function getProjectCollapsedState(
  collapsedProjects: Record<string, boolean>,
  projectId: string,
  activeProjectId: string,
) {
  return collapsedProjects[projectId] ?? projectId !== activeProjectId;
}

export function isProjectIssuesView(section: SidebarProjectSection) {
  const { activeProjectId, filters, activeContext } = section;

  return (
    activeContext !== 'notes'
    && filters.projectId === activeProjectId
    && !filters.assigneeId
    && !filters.domainId
    && !filters.cycleId
  );
}

export function isMyIssuesView(section: SidebarProjectSection) {
  const { activeProjectId, currentUser, filters, activeContext } = section;

  return (
    activeContext !== 'notes'
    && filters.projectId === activeProjectId
    && filters.assigneeId === currentUser.id
    && !filters.domainId
    && !filters.cycleId
  );
}

export function isNotesView(section: SidebarProjectSection) {
  return section.activeContext === 'notes';
}