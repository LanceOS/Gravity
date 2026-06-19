import type { Comment, Cycle, Label, Project, Ticket, User } from '../../../context/TicketContextContext';

export interface TicketDetailProps {
  activeTicket: Ticket;
  comments: Comment[];
  subtasks: Ticket[];
  availableTickets: Ticket[];
  ticketsById?: Map<string, Ticket>;
  completedSubtasks: number;
  subtaskProgressPercent: number;
  users: User[];
  projects: Project[];
  labels: Label[];
  cycles: Cycle[];
  parentTicket?: Ticket | null;
  activeTicketDetail: Ticket | null;
  onSelectTicket: (ticket: Ticket | null) => void;
  onUpdateTicket: (id: string, updates: Partial<Ticket>, options?: { immediate?: boolean }) => Promise<void>;
  onDeleteTicket: (ticketId: string) => Promise<void>;
  onAddComment: (ticketId: string, body: string) => Promise<void>;
  onUpdateComment: (ticketId: string, commentId: string, body: string) => Promise<void>;
  onDeleteComment: (ticketId: string, commentId: string) => Promise<void>;
  onClose?: () => void;
  onOpenCreateSubtask: (parentId: string) => void;
  onAddDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  onRemoveDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  onAddBlocker?: (ticketId: string, blockerId: string) => Promise<boolean>;
  onRemoveBlocker?: (ticketId: string, blockerId: string) => Promise<boolean>;
  ticketLink?: string;
}

export interface MarkdownTextProps {
  text: string;
}
