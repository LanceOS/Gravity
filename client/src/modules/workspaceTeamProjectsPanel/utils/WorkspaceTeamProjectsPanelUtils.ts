import type { Project, SidebarTeam, SidebarTree } from '../../../types/domain';
import type { WorkspaceTeamProjectsPanelDraft, WorkspaceTeamProjectsPanelFeedback } from '../types/WorkspaceTeamProjectsPanel';

export interface GithubRepoValidationResult {
  url: string | null;
  error: string | null;
}

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

export function validateGithubRepoUrl(value: string): GithubRepoValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { url: null, error: null };
  }

  try {
    const parsed = new URL(trimmed);
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || pathParts.length < 2) {
      return {
        url: null,
        error: 'URL must be a valid GitHub repository URL (e.g. https://github.com/owner/repo).',
      };
    }

    return { url: trimmed, error: null };
  } catch {
    return {
      url: null,
      error: 'Please enter a valid URL (e.g. https://github.com/owner/repo).',
    };
  }
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
  const activeProjectTeamId = projects.find((project) => project.id === activeProjectId)?.teamId ?? '';
  const sidebarActiveTeamId = teamId || activeProjectTeamId;
  const team = sidebarTree?.teams?.find((sidebarTeam) => sidebarTeam.id === sidebarActiveTeamId) ?? null;

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
