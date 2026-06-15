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
  ) => Promise<Project | null | undefined>;
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  onDeleteProject?: (id: string) => Promise<unknown>;
}

export interface WorkspaceTeamProjectsPanelDraft {
  name: string;
  description: string;
  githubRepoUrl: string;
  status: Project['status'];
}

export interface WorkspaceTeamProjectsPanelFeedback {
  type: 'success' | 'error';
  message: string;
}
