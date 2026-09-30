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

export type TicketUpdateOptions = {
  immediate?: boolean;
};

export interface TicketMutationContextType {
  createTicket: (ticket: CreateTicketInput) => Promise<Ticket | null>;
  updateTicket: (id: string, updates: Partial<Ticket>, options?: TicketUpdateOptions) => Promise<boolean | void>;
  deleteTicket: (id: string) => Promise<void>;
  moveTicket: (id: string, sourceProjectId: string, targetProjectId: string) => Promise<boolean>;
}
