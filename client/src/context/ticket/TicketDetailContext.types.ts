import type { Dispatch, SetStateAction } from 'react';
import type { Comment, Ticket } from '../../types/domain';
import type { TicketWithRelations } from '../../modules/tickets/utils/ticketRelations';

export interface TicketDetailContextType {
  activeTicket: Ticket | null;
  setActiveTicket: Dispatch<SetStateAction<Ticket | null>>;
  activeTicketId: string | undefined;
  activeTicketProjectId: string;
  comments: Comment[];
  activeTicketDetail: TicketWithRelations | null;
}

export interface TicketDetailContextValueArgs {
  activeTicket: Ticket | null;
  setActiveTicket: Dispatch<SetStateAction<Ticket | null>>;
  activeProjectId: string;
  isAuthenticated: boolean;
}
