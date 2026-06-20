import type { QueryClient } from '@tanstack/react-query';
import type { Project } from '../../types/domain';
import { queryKeys } from '../../utils/queryClient';

export type ProjectLookupEntry = {
  workspaceId: string;
  teamId: string | null;
};

export function createProjectLookup(projects: Project[]): Map<string, ProjectLookupEntry> {
  const lookup = new Map<string, ProjectLookupEntry>();

  for (const project of projects) {
    lookup.set(project.id, {
      workspaceId: project.workspaceId || '',
      teamId: project.teamId || null,
    });
  }

  return lookup;
}

export function createProjectById(projects: Project[]): Map<string, Project> {
  const byId = new Map<string, Project>();

  for (const project of projects) {
    byId.set(project.id, project);
  }

  return byId;
}

export function createProjectsByWorkspaceId(projects: Project[]): Map<string, Project[]> {
  const byWorkspaceId = new Map<string, Project[]>();

  for (const project of projects) {
    const workspaceId = project.workspaceId || '';
    const current = byWorkspaceId.get(workspaceId);
    if (current) {
      current.push(project);
    } else {
      byWorkspaceId.set(workspaceId, [project]);
    }
  }

  return byWorkspaceId;
}

export function resolveWorkspaceIdForSse(
  projects: Project[],
  projectLookup: Map<string, ProjectLookupEntry>,
  activeProjectId: string,
): string {
  if (activeProjectId) {
    const activeWorkspaceId = projectLookup.get(activeProjectId)?.workspaceId;
    if (activeWorkspaceId) {
      return activeWorkspaceId;
    }
  }

  return projects.length > 0 && projects[0]?.workspaceId ? projects[0].workspaceId : '';
}

export function invalidateWorkspaceSidebarQueries(
  queryClient: QueryClient,
  projectLookup: Map<string, ProjectLookupEntry>,
  projectId?: string | null,
): void {
  if (projectId) {
    const workspaceId = projectLookup.get(projectId)?.workspaceId;
    if (workspaceId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSidebarTree(workspaceId), exact: true });
      return;
    }
  }

  for (const [queryKey] of queryClient.getQueriesData({ queryKey: ['workspace'] })) {
    const normalizedQueryKey = [...queryKey];
    if (queryKey[0] === 'workspace' && queryKey[2] === 'sidebar') {
      queryClient.invalidateQueries({ queryKey: normalizedQueryKey, exact: true });
    }
  }
}
