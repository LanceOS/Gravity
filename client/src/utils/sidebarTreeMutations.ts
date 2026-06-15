import type { QueryClient } from '@tanstack/react-query';
import type { SidebarTeam, SidebarTree } from '../types/domain';

const SIDEBAR_TREE_QUERY_PREFIX = ['sidebarTree'] as const;

function withSidebarTreeData(
  queryClient: QueryClient,
  workspaceId: string,
  updater: (current: SidebarTree) => SidebarTree,
) {
  queryClient.setQueryData<SidebarTree | undefined>([...SIDEBAR_TREE_QUERY_PREFIX, workspaceId], (current) => {
    if (!current) {
      return current;
    }

    return updater(current);
  });
}

export function updateSidebarTeam(
  queryClient: QueryClient,
  workspaceId: string,
  teamId: string,
  updater: (team: SidebarTeam) => SidebarTeam,
) {
  withSidebarTreeData(queryClient, workspaceId, (current) => ({
    ...current,
    teams: current.teams.map((team) => (team.id === teamId ? updater(team) : team)),
  }));
}

export function addSidebarTeam(queryClient: QueryClient, workspaceId: string, team: SidebarTeam) {
  withSidebarTreeData(queryClient, workspaceId, (current) => ({
    ...current,
    teams: [...current.teams, team],
  }));
}

export function removeSidebarTeam(queryClient: QueryClient, workspaceId: string, teamId: string) {
  withSidebarTreeData(queryClient, workspaceId, (current) => ({
    ...current,
    teams: current.teams.filter((team) => team.id !== teamId),
  }));
}

export function addProjectToTeam(
  queryClient: QueryClient,
  workspaceId: string,
  teamId: string,
  project: SidebarTeam['projects'][number],
) {
  updateSidebarTeam(queryClient, workspaceId, teamId, (team) => ({
    ...team,
    projects: [...(team.projects || []), project],
  }));
}

export function updateProjectInTeam(
  queryClient: QueryClient,
  workspaceId: string,
  teamId: string,
  projectId: string,
  updater: (project: SidebarTeam['projects'][number]) => SidebarTeam['projects'][number],
) {
  updateSidebarTeam(queryClient, workspaceId, teamId, (team) => ({
    ...team,
    projects: team.projects?.map((project) => (project.id === projectId ? updater(project) : project)),
  }));
}

export function removeProjectFromTeam(queryClient: QueryClient, workspaceId: string, teamId: string, projectId: string) {
  updateSidebarTeam(queryClient, workspaceId, teamId, (team) => ({
    ...team,
    projects: (team.projects || []).filter((project) => project.id !== projectId),
  }));
}
