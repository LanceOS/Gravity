import type { Project, Ticket, User } from '../../../context/TicketContextContext';
import type { WorkspaceSettings } from '../../../utils/settings';

export interface LocalAIChatProps {
  onClose?: () => void;
  initialOllamaUrl: string;
  initialModel: string;
  settings: WorkspaceSettings;
  workspaceId?: string;
  projectId?: string;
  isClosing?: boolean;
  variant?: 'floating' | 'embedded';
  /** Seeds the cloud chat session id used for this conversation (e.g. when resuming a past chat). */
  seedChatSessionId?: string;
  /** Seeds the visible transcript (e.g. history loaded for a resumed chat session). */
  seedMessages?: Message[];
  /** Called when a cloud chat session is created (either lazily on first message or externally). */
  onSessionCreated?: (chatId: string) => void;
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
