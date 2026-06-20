export interface TicketFiltersState {
  status: string;
  labels: string[];
}

export function mergePartialFilters(state: TicketFiltersState, updates: Partial<TicketFiltersState>): TicketFiltersState {
  let hasChanges = false;
  const nextState = { ...state };

  const checkAndSet = <K extends keyof TicketFiltersState>(key: K) => {
    const newValue = updates[key];
    if (newValue !== undefined) {
      const prevValue = state[key];

      if (Array.isArray(newValue) && Array.isArray(prevValue)) {
        if (newValue.length !== prevValue.length || newValue.some((v, i) => v !== prevValue[i])) {
          nextState[key] = newValue as NonNullable<TicketFiltersState[K]>;
          hasChanges = true;
        }
      } else if (newValue !== prevValue) {
        nextState[key] = newValue as NonNullable<TicketFiltersState[K]>;
        hasChanges = true;
      }
    }
  };

  const keys = Object.keys(updates) as Array<keyof TicketFiltersState>;
  keys.forEach(checkAndSet);

  return hasChanges ? nextState : state;
}
