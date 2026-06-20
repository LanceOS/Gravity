import type { QueryClient } from '@tanstack/react-query';
import type { Ticket } from '../../types/domain';
import type { TicketWithRelations } from '../../modules/tickets/utils/ticketRelations';

export interface TicketRelationsContextType {
  activeTicketDetail: TicketWithRelations | null;
  addTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  removeTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  addTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  removeTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
}

export interface TicketRelationsContextValueArgs {
  queryClient: QueryClient;
  tickets: Ticket[];
  activeTicket: Ticket | null;
  activeTicketDetail: TicketWithRelations | null;
}
