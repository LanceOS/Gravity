import type { SidebarTeam, Project, SidebarTree } from '../../../types/domain';
import { WorkspaceTeamProjectsPanelPage } from '../../workspaceTeamProjectsPanel/screens/WorkspaceTeamProjectsPanelPage';

export const WorkspaceTeamProjectsPage = ({
  workspaceId,
  workspaceName,
  team,
  projects,
  activeProjectId,
  onBackToTeams,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
}: {
  workspaceId: string;
  workspaceName: string;
  team: SidebarTeam | null;
  projects: Project[];
  activeProjectId: string;
  loading?: boolean;
  onBackToTeams: () => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<Project | null | undefined>;
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  onDeleteProject?: (id: string) => Promise<void>;
}) => {
  const sidebarTree: Pick<SidebarTree, 'teams'> | undefined = team ? { teams: [team] } : undefined;

  return (
    <WorkspaceTeamProjectsPanelPage
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      teamId={team?.id}
      sidebarTree={sidebarTree}
      projects={projects}
      activeProjectId={activeProjectId}
      onBackToTeams={onBackToTeams}
      onCreateProject={async (project) => {
        return onCreateProject(project);
      }}
      onUpdateProject={onUpdateProject}
      onDeleteProject={onDeleteProject}
    />
  );
};
