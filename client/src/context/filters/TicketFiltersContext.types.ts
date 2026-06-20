import type { TicketFiltersState } from '../shared/filters';

export interface TicketFiltersContextType {
  filters: TicketFiltersState;
  setFilters: (nextFilters: Partial<TicketFiltersState>) => void;
  resetFilters: () => void;
}
