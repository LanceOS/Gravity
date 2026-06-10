import type { DragEvent, ReactNode } from 'react';
import type { Label, Ticket } from '../../../context/TicketContext';
import type { TicketsByStatus } from '../utils/ticketView';

export interface TicketBoardProps {
  ticketsByColumn: TicketsByStatus;
  labelById?: Record<string, Label>;
  domainById?: Record<string, Label>;
  userAvatarById: Record<string, string>;
  onMoveTicket: (ticketId: string, updates: Partial<Ticket>) => Promise<void>;
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreateTicket: (initialStatus?: Ticket['status']) => void;
}

export interface TicketCardProps {
  ticket: Ticket;
  onClick: () => void;
  onDragStart: (event: DragEvent) => void;
  priorityIcon: ReactNode;
  priorityColor: string;
  assigneeAvatar: string | null;
}
