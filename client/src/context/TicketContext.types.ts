import type { Dispatch, SetStateAction } from 'react';
import type { User, Ticket } from '../types/domain';

// Shared entity types live in src/types/domain.ts.
export type {
  User,
  Project,
  Domain,
  Label,
  Cycle,
  Ticket,
  Comment,
  CreateProjectInput,
} from '../types/domain';

interface State {
  tickets: Ticket[];
  users: User[];
  activeTicket: Ticket | null;
  currentUser: User | null;
  loading: boolean;
}

// TicketFiltersState is imported from ./shared/filters and re-exported below.
export type { TicketFiltersState } from './shared';

/**
 * @deprecated Prefer narrow domain hooks like useAuth(), useTheme(), useTicketList(), and useTicketFilters().
 */
export interface TicketContextType extends State {
  addComment: (ticketId: string, body: string) => Promise<void>;
  updateComment: (ticketId: string, commentId: string, body: string) => Promise<void>;
  deleteComment: (ticketId: string, commentId: string) => Promise<void>;
  setActiveTicket: Dispatch<SetStateAction<Ticket | null>>;
  addTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  removeTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  addTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  removeTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  ticketMap: Map<string, Ticket>;
}
