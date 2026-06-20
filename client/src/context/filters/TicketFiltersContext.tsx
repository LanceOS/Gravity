import React, { createContext, useContext, useReducer, ReactNode, useCallback } from 'react';
import type { TicketFiltersContextType } from './TicketFiltersContext.types';
import { initialFilters, type TicketFiltersState } from '../shared/filters';

type FilterAction = 
  | { type: 'UPDATE'; payload: Partial<TicketFiltersState> }
  | { type: 'RESET' };

function filtersReducer(state: TicketFiltersState, action: FilterAction): TicketFiltersState {
  switch (action.type) {
    case 'UPDATE': {
      let hasChanges = false;
      const nextState = { ...state };

      const checkAndSet = <K extends keyof TicketFiltersState>(key: K) => {
        const newValue = action.payload[key];
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

      const keys = Object.keys(action.payload) as Array<keyof TicketFiltersState>;
      keys.forEach(checkAndSet);

      return hasChanges ? nextState : state;
    }
    case 'RESET':
      return { ...initialFilters, projectId: state.projectId };
    default:
      return state;
  }
}

const TicketFiltersContext = createContext<TicketFiltersContextType | undefined>(undefined);

export const TicketFiltersProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [filters, dispatch] = useReducer(filtersReducer, initialFilters);

  const setFilters = useCallback((nextFilters: Partial<TicketFiltersState>) => {
    dispatch({ type: 'UPDATE', payload: nextFilters });
  }, []);

  const resetFilters = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return (
    <TicketFiltersContext.Provider value={{ filters, setFilters, resetFilters }}>
      {children}
    </TicketFiltersContext.Provider>
  );
};

export const useTicketFilters = (): TicketFiltersContextType => {
  const context = useContext(TicketFiltersContext);
  if (!context) {
    throw new Error('useTicketFilters must be used within a TicketFiltersProvider');
  }
  return context;
};
