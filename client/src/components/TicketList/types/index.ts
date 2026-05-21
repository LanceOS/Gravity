import type { ReactNode } from 'react';
import type { Domain, Ticket } from '../../../context/TicketContext';
import type { TicketFilters, TicketsByStatus } from '../../../utils/ticketView';

export interface TicketListProps {
  filters: TicketFilters;
  filteredCount: number;
  totalCount: number;
  groupedTickets: TicketsByStatus;
  domainById: Record<string, Domain>;
  userAvatarById: Record<string, string>;
  hasActiveFilters: boolean;
  onFilterChange: (filters: Partial<TicketFilters>) => void;
  onClearFilters: () => void;
  onSelectTicket: (ticket: Ticket) => void;
}

export interface TicketRowProps {
  ticket: Ticket;
  onClick: () => void;
  priorityIcon: ReactNode;
  assigneeAvatar: string | null;
  domainTag: ReactNode;
}