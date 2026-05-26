import type { DragEvent, ReactNode } from 'react';
import type { Domain, Ticket } from '../../../context/TicketContext';
import type { TicketsByStatus } from '../utils/ticketView';

export interface TicketBoardProps {
  ticketsByColumn: TicketsByStatus;
  domainById: Record<string, Domain>;
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
  domainColor: string;
  domainName: string;
  assigneeAvatar: string | null;
}