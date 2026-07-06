import type { Project, Ticket, User } from '../../../context/TicketContextContext';
import type { SidebarTeam } from '../../../types/domain';
import type { WorkspaceSettings } from '../../../utils/settings';

export type TicketAttachmentScopeMode = 'project' | 'team';

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
  ticketAttachmentScopeMode?: TicketAttachmentScopeMode;
  ticketAttachmentProjects?: Project[];
  ticketAttachmentTeams?: SidebarTeam[];
  ticketAttachmentDefaultScopeId?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Extra context sent to the model with this visible message but not rendered in the transcript. */
  modelContext?: string;
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

export interface AttachedTicketContext {
  tickets: Ticket[];
  projects: Project[];
  users: User[];
}

export interface SendMessageOptions {
  modelContext?: string;
}

export interface MarkdownTextProps {
  text: string;
}
