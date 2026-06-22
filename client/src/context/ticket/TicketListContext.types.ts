import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { Ticket, User } from '../../types/domain';

export interface TicketListContextType {
  tickets: Ticket[];
  activeTicket: Ticket | null;
  setActiveTicket: Dispatch<SetStateAction<Ticket | null>>;
  ticketMap: Map<string, Ticket>;
  ticketById: Map<string, Ticket>;
  ticketsByProject: Map<string, Ticket[]>;
}

export interface TicketListContextValueArgs {
  currentUser: User | null;
}

export interface TicketListProviderProps extends TicketListContextValueArgs {
  children: ReactNode;
}
