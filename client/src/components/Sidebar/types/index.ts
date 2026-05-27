import type { Cycle, Domain, Project, User } from '../../../context/TicketContext';
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
  domains: Record<string, number>;
  cycles: Record<string, number>;
}

export interface SidebarProjectSection {
  projects: Project[];
  domains: Domain[];
  cycles: Cycle[];
  currentUser: User;
  activeProjectId: string;
  filters: TicketFilters;
  counts: SidebarProjectCounts;
  onSelectProject: (projectId: string) => void;
  onShowProjectIssues: () => void;
  onShowMyIssues: () => void;
  onSelectCycle: (cycleId: string) => void;
  onSelectDomain: (domainId: string) => void;
}

export interface SidebarToolSection {
  onOpenOllama: () => void;
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
  onSignOut: () => void;
}

export interface SidebarProps {
  workspace: SidebarWorkspaceSection;
  projects: SidebarProjectSection;
  tools: SidebarToolSection;
  userMenu: SidebarUserMenuSection;
}