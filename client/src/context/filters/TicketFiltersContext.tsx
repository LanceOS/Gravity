import React, { createContext, useContext, useReducer, ReactNode, useCallback, useEffect } from 'react';
import type { TicketFiltersContextType } from './TicketFiltersContext.types';
import { initialFilters, type TicketFiltersState } from '../shared/filters';
import { useActiveProject } from '../project/ActiveProjectContext';

type FilterAction = 
  | { type: 'UPDATE'; payload: Partial<TicketFiltersState> }
  | { type: 'RESET' };

function filtersReducer(state: TicketFiltersState, action: FilterAction, activeProjectIdRef: React.MutableRefObject<string>): TicketFiltersState {
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
      return { ...initialFilters, projectId: activeProjectIdRef.current };
    default:
      return state;
  }
}

const TicketFiltersContext = createContext<TicketFiltersContextType | undefined>(undefined);

export const TicketFiltersProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { activeProjectId, activeProjectIdRef } = useActiveProject();

  const [filters, dispatch] = useReducer(
    (state: TicketFiltersState, action: FilterAction) => filtersReducer(state, action, activeProjectIdRef), 
    initialFilters,
    () => ({ ...initialFilters, projectId: activeProjectIdRef.current })
  );

  const setFilters = useCallback((nextFilters: Partial<TicketFiltersState>) => {
    dispatch({ type: 'UPDATE', payload: nextFilters });
  }, []);

  const resetFilters = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  useEffect(() => {
    if (filters.projectId !== activeProjectId) {
      setFilters({ projectId: activeProjectId });
    }
  }, [activeProjectId, filters.projectId, setFilters]);

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
