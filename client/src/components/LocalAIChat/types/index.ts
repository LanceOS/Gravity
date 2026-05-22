import type { Project, Ticket, User } from '../../../context/TicketContext';
import type { WorkspaceSettings } from '../../../utils/settings';

export interface LocalAIChatProps {
  onClose: () => void;
  initialOllamaUrl: string;
  initialModel: string;
  settings: WorkspaceSettings;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type QuickActionType = 'analyze' | 'subtasks' | 'release';

export interface QuickActionContext {
  activeTicket: Ticket;
  projects: Project[];
  users: User[];
}

export interface MarkdownTextProps {
  text: string;
}