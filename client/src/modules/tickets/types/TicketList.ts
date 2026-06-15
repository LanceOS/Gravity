import type { ReactNode } from 'react';
import type { Project, Ticket } from '../../../context/TicketContext';
import type { TicketsByStatus } from '../utils/ticketView';

export interface TicketListProps {
  filteredCount: number;
  groupedTickets: TicketsByStatus;
  availableTickets?: Ticket[];
  userAvatarById: Record<string, string>;
  /** When provided, each ticket row shows a project badge (teams all-tasks view). */
  projectById?: Record<string, Project>;
  onSelectTicket: (ticket: Ticket) => void;
}

export interface TicketListPropsWithPerformance extends TicketListProps {
  onLoadMore?: () => void;
  hasMoreRows?: boolean;
  isLoadingMoreRows?: boolean;
}

export interface TicketRowProps {
  ticket: Ticket;
  onClick: (ticket: Ticket) => void;
  priorityIcon: ReactNode;
  assigneeAvatar: string | null;
  /** When provided, renders a small project badge on the row. */
  projectName?: string;
  projectColor?: string;
}
