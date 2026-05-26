import type { DragEvent, ReactNode } from 'react';
import type { Domain, Project, Ticket } from '../../../context/TicketContext';
import type { TicketFilters, TicketsByStatus } from '../utils/ticketView';

export interface TicketBoardProps {
  projects: Project[];
  filters: TicketFilters;
  filteredCount: number;
  totalCount: number;
  ticketsByColumn: TicketsByStatus;
  domainById: Record<string, Domain>;
  userAvatarById: Record<string, string>;
  hasActiveFilters: boolean;
  onFilterChange: (filters: Partial<TicketFilters>) => void;
  onClearFilters: () => void;
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