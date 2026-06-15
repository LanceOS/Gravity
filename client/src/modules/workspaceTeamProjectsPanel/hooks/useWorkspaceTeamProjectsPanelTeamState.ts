import { useMemo } from 'react';
import type { SidebarTree, Project } from '../../../types/domain';
import {
  resolveManagedProjectsForTeam,
  resolveTeamWorkspaceContext,
} from '../utils/WorkspaceTeamProjectsPanelUtils';
import type { SidebarTeam } from '../../../types/domain';

interface ResolveTeamStateArgs {
  projects: Project[];
  activeProjectId: string;
  teamId?: string | null;
  sidebarTree?: Pick<SidebarTree, 'teams'>;
}

export interface UseWorkspaceTeamProjectsPanelTeamStateResult {
  team: SidebarTeam | null;
  managedProjects: Project[];
  sortedProjects: Project[];
  sidebarActiveTeamId: string;
  activeProjectTeamId: string;
  loading: boolean;
  teamProjectIds: Set<string>;
}

export function useWorkspaceTeamProjectsPanelTeamState({
  projects,
  activeProjectId,
  teamId,
  sidebarTree,
}: ResolveTeamStateArgs): UseWorkspaceTeamProjectsPanelTeamStateResult {
  const { sidebarActiveTeamId, activeProjectTeamId, team } = resolveTeamWorkspaceContext({
    projects,
    activeProjectId,
    teamId,
    sidebarTree,
  });

  const { managedProjects, teamProjectIds } = useMemo(
    () => resolveManagedProjectsForTeam(projects, sidebarActiveTeamId, team),
    [projects, sidebarActiveTeamId, team],
  );

  const sortedProjects = useMemo(
    () => [...managedProjects].sort((first, second) => first.name.localeCompare(second.name)),
    [managedProjects],
  );

  return {
    team,
    managedProjects,
    sortedProjects,
    sidebarActiveTeamId,
    activeProjectTeamId,
    loading: !sidebarTree || !team,
    teamProjectIds,
  };
}

