import type { Project, SidebarTree } from '../../../types/domain';

export interface WorkspaceTeamProjectsPanelProps {
  workspaceId: string;
  workspaceName: string;
  projects: Project[];
  activeProjectId: string;
  sidebarTree?: Pick<SidebarTree, 'teams'>;
  teamId?: string | null;
  onBackToTeams: () => void;
  onCreateProject: (
    project: {
      name: string;
      description: string;
      key: string;
      workspaceId?: string;
      teamId?: string;
      status?: 'planned' | 'active' | 'completed';
    }
  ) => Promise<void | unknown>;
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  onDeleteProject?: (id: string) => Promise<unknown>;
}
