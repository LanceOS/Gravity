import type { Ticket } from '../../types/domain';

export type CreateTicketInput = {
  title: string;
  description: string;
  status: Ticket['status'];
  priority: Ticket['priority'];
  projectId: string;
  labelIds?: string[];
  cycleId: string | null;
  assigneeId: string | null;
  parentId: string | null;
  labelId?: string | null;
  domainId?: string | null;
};

export type TicketUpdateBatch = {
  originalTickets: Ticket[];
  projectId: string;
  updates: Partial<Ticket>;
  timerId: number | null;
  flushRequested: boolean;
};

export type TicketUpdateOptions = {
  immediate?: boolean;
};

export type InFlightTicketUpdateBatch = {
  originalTickets: Ticket[];
  projectId: string;
  updates: Partial<Ticket>;
};

export interface TicketMutationContextType {
  createTicket: (ticket: CreateTicketInput) => Promise<Ticket | null>;
  updateTicket: (id: string, updates: Partial<Ticket>, options?: TicketUpdateOptions) => Promise<void>;
  deleteTicket: (id: string) => Promise<void>;
  moveTicket: (id: string, sourceProjectId: string, targetProjectId: string) => Promise<boolean>;
}
