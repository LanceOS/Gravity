/**
 * The shape of the ticket filter state used throughout the context and views.
 * Defined here so it can be imported by shared modules without pulling in the
 * full React context.
 */
export interface TicketFiltersState {
  status: string;
  priority: string;
  projectId: string;
  labelId?: string;
  domainId?: string;
  labels: string[];
  labelMode: 'all' | 'any';
  cycleId: string;
  assigneeId: string;
  search: string;
}

/**
 * The canonical empty/default filter state.
 * Treat this as a read-only reference — do not mutate it directly.
 * Call `resetFilters()` to get a fresh mutable copy.
 */
export const initialFilters: TicketFiltersState = {
  status: '',
  priority: '',
  projectId: '',
  labelId: '',
  labels: [] as string[],
  labelMode: 'any',
  cycleId: '',
  assigneeId: '',
  search: '',
};

/**
 * Returns a fresh copy of `initialFilters`.
 * Use this when you need to reset state without mutating the original object.
 */
export function resetFilters(): TicketFiltersState {
  return {
    ...initialFilters,
    labels: [],
  };
}
