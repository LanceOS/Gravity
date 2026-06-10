import type { ReactNode } from 'react';
import type { Label, Ticket } from '../../../context/TicketContext';
import type { TicketsByStatus } from '../utils/ticketView';

export interface TicketListProps {
  filteredCount: number;
  groupedTickets: TicketsByStatus;
  labelById?: Record<string, Label>;
  domainById?: Record<string, Label>;
  userAvatarById: Record<string, string>;
  onSelectTicket: (ticket: Ticket) => void;
}

export interface TicketRowProps {
  ticket: Ticket;
  onClick: (ticket: Ticket) => void;
  priorityIcon: ReactNode;
  assigneeAvatar: string | null;
}
