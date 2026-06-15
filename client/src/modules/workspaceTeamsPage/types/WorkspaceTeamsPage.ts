import type { SidebarTeam } from '../../../types/domain';

export interface TeamDraft {
  name: string;
  description: string;
  color: string;
}

export interface WorkspaceTeamsPageFeedback {
  type: 'success' | 'error';
  message: string;
}

export interface WorkspaceTeamsPageProps {
  workspaceId: string;
  workspaceName: string;
  teams: SidebarTeam[];
  loading?: boolean;
  onBackToWorkspace: () => void;
  onManageProjects?: (teamId: string) => void;
  onTeamsChanged?: () => Promise<void> | void;
}
