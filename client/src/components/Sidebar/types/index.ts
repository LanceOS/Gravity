import type { Cycle, Label, Project, User } from '../../../context/TicketContext';
import type { TicketFilters } from '../../../modules/tickets/utils/ticketView';

export interface SidebarWorkspaceOption {
  id: string;
  name: string;
}

export type SidebarActiveArea = 'workspace' | 'settings' | 'account' | 'projects';

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
}

import type { SidebarTeam } from '../../../types/domain';

export interface SidebarProjectSection {
  hierarchyMode?: 'flat' | 'teams';
  teams?: SidebarTeam[];
  activeTeamId?: string;
  activeCycleId?: string;
  activeDomainId?: string;
  onSelectTeam?: (teamId: string) => void;
  onSelectCycle?: (teamId: string, cycleId: string) => void;
  onSelectDomain?: (teamId: string, domainId: string) => void;
  onSelectAllTasks?: (teamId: string) => void;

  projects: Project[];
  labels?: Label[];
  domains?: Label[];
  cycles: Cycle[];
  currentUser: User;
  activeProjectId: string;
  filters: TicketFilters;
  counts: SidebarProjectCounts;
  onSelectProject: (projectId: string) => void;
  activeContext?: 'issues' | 'notes';
  onShowProjectIssues: () => void;
  onShowMyIssues: () => void;
  onShowNotes: () => void;
  onSelectCycleLegacy?: (cycleId: string) => void;
  onSelectLabel?: (labelId: string) => void;
}

export interface SidebarToolSection {
  onOpenOllama: () => void;
  isOllamaOpen?: boolean;
  onOpenSimulator: () => void;
  onOpenCreateTicket: () => void;
  agentIntegration?: 'ollama' | 'third_party';
  aiProvider?: 'openai' | 'anthropic' | 'gemini' | 'deepseek';
}

export interface SidebarUserMenuSection {
  currentUser: User;
  activeArea?: SidebarActiveArea;
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
