import type { Cycle, Label, Project, User } from '../../../context/TicketContext';
import type { TicketFilters } from '../../../modules/tickets';

export interface SidebarWorkspaceOption {
  id: string;
  name: string;
}

export type SidebarActiveArea = 'workspace' | 'settings' | 'account' | 'projects' | 'teams';

export interface SidebarWorkspaceSection {
  workspaces: SidebarWorkspaceOption[];
  activeWorkspaceId: string;
  onSelectWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceDirectory: () => void;
}

export interface SidebarProjectCounts {
  myIssues: number;
  activeProjectIssues: number;
  labels?: Record<string, number>;
  domains?: Record<string, number>;
  cycles: Record<string, number>;
  byProject?: Record<
    string,
    {
      myIssues?: number;
      activeProjectIssues?: number;
      labels?: Record<string, number>;
      cycles?: Record<string, number>;
    }
  >;
}

import type { SidebarTeam } from '../../../types/domain';

export type SidebarScope = 'workspace' | 'workspace-projects' | 'views' | 'cycles' | 'labels' | 'projects';

export interface SidebarNavigationState {
  activeTeam: string;
  activeScope: SidebarScope;
  activeProject: string;
}

export interface SidebarProjectSection {
  hierarchyMode?: 'flat' | 'teams';
  teams?: SidebarTeam[];
  navigationState?: SidebarNavigationState;
  activeViewId?: string;
  activeTeamId?: string;
  activeCycleId?: string;
  activeLabelId?: string;
  onSelectWorkspaceAllTasks?: () => void;
  onSelectWorkspaceProjects?: () => void;
  onSelectTeam?: (teamId: string) => void;
  onSelectView?: (teamId: string, viewId: string) => void;
  onSelectCycle?: (teamId: string, cycleId: string) => void;
  onSelectTeamLabel?: (teamId: string, labelId: string) => void;
  onSelectAllTasks?: (teamId: string) => void;

  projects: Project[];
  onPrefetchProject?: (projectId: string) => void | Promise<void>;
  labels?: Label[];
  labelsByProject?: Map<string, Label[]>;
  domains?: Label[];
  cycles: Cycle[];
  currentUser: User;
  activeProjectId: string;
  filters: TicketFilters;
  counts: SidebarProjectCounts;
  onSelectProject: (projectId: string) => void;
  onHasCachedProjectData?: (projectId: string) => boolean;
  activeContext?: 'issues' | 'notes';
  onShowProjectIssues: (projectId?: string) => void;
  onShowMyIssues: (projectId?: string) => void;
  onShowNotes: (projectId?: string) => void;
  onSelectCycleLegacy?: (projectId: string, cycleId: string) => void;
  onSelectLabel?: (projectId: string, labelId: string) => void;
  isWorkspaceOwner?: boolean;
  onOpenTeamManager?: () => void;
  onOpenCreateTeam?: () => void;
}

export interface SidebarToolSection {
  onOpenOllama: () => void;
  isOllamaOpen?: boolean;
  onOpenSimulator: () => void;
  onOpenCreateTicket: () => void;
  onOpenCreateProject?: () => void;
  onOpenCreateLabel?: () => void;
  agentIntegration?: 'ollama' | 'third_party';
  aiProvider?: 'openai' | 'anthropic' | 'gemini' | 'deepseek';
}

export interface SidebarUserMenuSection {
  currentUser: User;
  activeArea?: SidebarActiveArea;
  showWorkspaceManagement?: boolean;
  workspaceManagementLabel?: string;
  workspaceManagementArea?: SidebarActiveArea;
  onOpenWorkspaceDirectory: () => void;
  onOpenAccountPreferences: () => void;
  onOpenProjectManager: () => void;
  onOpenSettings: () => void;
  onOpenMcp: () => void;
  onSignOut: () => void;
}

export interface SidebarProps {
  workspace: SidebarWorkspaceSection;
  projects: SidebarProjectSection;
  tools: SidebarToolSection;
  userMenu: SidebarUserMenuSection;
}
