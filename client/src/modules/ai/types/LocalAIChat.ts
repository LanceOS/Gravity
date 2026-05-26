import type { Project, Ticket, User } from '../../../context/TicketContext';
import type { WorkspaceSettings } from '../../../utils/settings';

export interface LocalAIChatProps {
  onClose: () => void;
  initialOllamaUrl: string;
  initialModel: string;
  settings: WorkspaceSettings;
  workspaceId?: string;
  isClosing?: boolean;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown> | string;
  }>;
  tool_call_id?: string;
  name?: string;
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