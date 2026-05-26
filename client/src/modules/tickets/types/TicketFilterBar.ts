import type { Domain, Ticket } from '../../../context/TicketContext';
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
  domains?: Domain[];
}
