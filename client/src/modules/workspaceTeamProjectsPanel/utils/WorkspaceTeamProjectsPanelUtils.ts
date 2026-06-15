import type { Project, SidebarTeam, SidebarTree } from '../../../types/domain';
import type { WorkspaceTeamProjectsPanelDraft, WorkspaceTeamProjectsPanelFeedback } from '../types/WorkspaceTeamProjectsPanel';
import { type GithubRepoValidationResult } from '../../../utils/project';

export type { GithubRepoValidationResult };

export interface ResolveTeamWorkspaceArgs {
  projects: Project[];
  activeProjectId: string;
  teamId?: string | null;
  sidebarTree?: Pick<SidebarTree, 'teams'>;
}

export interface ResolveTeamWorkspaceResult {
  sidebarActiveTeamId: string;
  activeProjectTeamId: string;
  team: SidebarTeam | null;
}

export interface ResolveManagedProjectsResult {
  managedProjects: Project[];
  teamProjectIds: Set<string>;
}

export function getProjectDraft(project?: Project | null): WorkspaceTeamProjectsPanelDraft {
  return {
    name: project?.name ?? '',
    description: project?.description ?? '',
    githubRepoUrl: project?.githubRepoUrl ?? '',
    status: project?.status ?? 'active',
  };
}


export function createWorkspaceTeamProjectsPanelFeedback(
  type: WorkspaceTeamProjectsPanelFeedback['type'],
  message: string,
): WorkspaceTeamProjectsPanelFeedback {
  return { type, message };
}

export function resolveTeamWorkspaceContext({
  projects,
  activeProjectId,
  teamId,
  sidebarTree,
}: ResolveTeamWorkspaceArgs): ResolveTeamWorkspaceResult {
  const projectTeamById = new Map(projects.map((project) => [project.id, project.teamId]));
  const sidebarTeamById = new Map((sidebarTree?.teams ?? []).map((sidebarTeam) => [sidebarTeam.id, sidebarTeam]));
  const activeProjectTeamId = projectTeamById.get(activeProjectId) ?? '';
  const sidebarActiveTeamId = teamId || activeProjectTeamId;
  const team = sidebarTeamById.get(sidebarActiveTeamId) ?? null;

  return {
    sidebarActiveTeamId,
    activeProjectTeamId,
    team,
  };
}

export function resolveManagedProjectsForTeam(
  projects: Project[],
  sidebarActiveTeamId: string,
  team: SidebarTeam | null,
): ResolveManagedProjectsResult {
  const teamProjectIds = new Set(team?.projects?.map((project) => project.id) ?? []);

  if (!sidebarActiveTeamId) {
    return {
      managedProjects: [],
      teamProjectIds,
    };
  }

  return {
    managedProjects: projects.filter(
      (project) => project.teamId === sidebarActiveTeamId || teamProjectIds.has(project.id),
    ),
    teamProjectIds,
  };
}
