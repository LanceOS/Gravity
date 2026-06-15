import type { Project, SidebarTree } from '../types/domain';

export interface BuildProjectScopedPathArgs {
  projectId: string;
  scope?: 'tickets' | 'notes';
  itemId?: string;
  activeWorkspaceId: string;
  projects: Project[];
  teamIdParam?: string;
  sidebarTree?: SidebarTree;
}

export function getActiveWorkspaceStorageKey(userId: string) {
  return `gravity_active_workspace:${userId}`;
}

export function normalizeInviteCode(value: string) {
  return value.toUpperCase();
}

export function normalizeProjectKey(value: string) {
  return value.toUpperCase();
}

export function buildProjectScopedPath({
  projectId,
  scope = 'tickets',
  itemId,
  activeWorkspaceId,
  projects,
  teamIdParam,
  sidebarTree,
}: BuildProjectScopedPathArgs): string {
  const project = projects.find((item) => item.id === projectId);
  const projectWorkspaceId = project?.workspaceId || activeWorkspaceId;
  const projectTeamId = project?.teamId || teamIdParam;
  const basePath =
    (sidebarTree?.hierarchyMode === 'teams' || !!teamIdParam) && projectTeamId
      ? `/workspaces/${projectWorkspaceId}/teams/${projectTeamId}/projects/${projectId}/${scope}`
      : `/workspaces/${projectWorkspaceId}/projects/${projectId}/${scope}`;

  return itemId ? `${basePath}/${itemId}` : basePath;
}
