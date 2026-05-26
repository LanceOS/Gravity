import type { ReactNode } from 'react';
import type { Domain, Ticket } from '../../../context/TicketContext';
import type { TicketsByStatus } from '../utils/ticketView';

export interface TicketListProps {
  filteredCount: number;
  groupedTickets: TicketsByStatus;
  domainById: Record<string, Domain>;
  userAvatarById: Record<string, string>;
  onSelectTicket: (ticket: Ticket) => void;
}

export interface TicketRowProps {
  ticket: Ticket;
  onClick: () => void;
  priorityIcon: ReactNode;
  assigneeAvatar: string | null;
  domainTag: ReactNode;
}