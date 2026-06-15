import type { DragEvent, ReactNode } from 'react';
import type { Ticket } from '../../../context/TicketContext';
import type { TicketsByStatus } from '../utils/ticketView';

export interface TicketBoardProps {
  ticketsByColumn: TicketsByStatus;
  availableTickets?: Ticket[];
  userAvatarById: Record<string, string>;
  onMoveTicket: (ticketId: string, updates: Partial<Ticket>) => Promise<void>;
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreateTicket: (initialStatus?: Ticket['status']) => void;
  onLoadMore?: () => void;
  hasMoreRows?: boolean;
  isLoadingMoreRows?: boolean;
}

export interface TicketCardProps {
  ticket: Ticket;
  onClick: () => void;
  onDragStart: (event: DragEvent) => void;
  priorityIcon: ReactNode;
  priorityColor: string;
  assigneeAvatar: string | null;
}
