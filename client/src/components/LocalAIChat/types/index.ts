import type { Project, Ticket, User } from '../../../context/TicketContext';

export interface LocalAIChatProps {
  onClose: () => void;
  initialOllamaUrl: string;
  initialModel: string;
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