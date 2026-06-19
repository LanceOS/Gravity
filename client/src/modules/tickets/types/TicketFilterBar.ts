import type { Label, Cycle, User } from '../../../context/TicketContextContext';
import type { TicketFilters, TicketListSort } from '../utils/ticketView';

export interface TicketFilterBarProps {
  filters: TicketFilters;
  onFilterChange: (filters: Partial<TicketFilters>) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  filteredCount: number;
  totalCount: number;
  listSort?: TicketListSort;
  onListSortChange?: (sort: TicketListSort) => void;
  labels?: Label[];
  domains?: Label[];
  cycles?: Cycle[];
  users?: User[];
}
