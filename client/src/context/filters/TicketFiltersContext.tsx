import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { TicketFiltersContextType } from './TicketFiltersContext.types';
import { initialFilters, type TicketFiltersState } from '../shared/filters';
import { useActiveProject } from '../project/ActiveProjectContext';

const TicketFiltersContext = createContext<TicketFiltersContextType | undefined>(undefined);

export const TicketFiltersProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { activeProjectId, activeProjectIdRef } = useActiveProject();
  const [filters, setFiltersState] = useState<TicketFiltersState>(initialFilters);

  useEffect(() => {
    setFiltersState((prev) => {
      if (prev.projectId === activeProjectId) {
        return prev;
      }
      return { ...prev, projectId: activeProjectId };
    });
  }, [activeProjectId]);

  const setFilters = useCallback((nextFilters: Partial<TicketFiltersState>) => {
    setFiltersState((prev) => {
      let hasChanges = false;
      const merged = { ...prev };
      
      for (const [key, value] of Object.entries(nextFilters)) {
        const prevValue = prev[key as keyof TicketFiltersState];
        
        if (Array.isArray(value) && Array.isArray(prevValue)) {
          if (value.length !== prevValue.length || !value.every((v, i) => v === prevValue[i])) {
            (merged as any)[key] = value;
            hasChanges = true;
          }
        } else if (prevValue !== value) {
          (merged as any)[key] = value;
          hasChanges = true;
        }
      }

      return hasChanges ? merged : prev;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({ ...initialFilters, projectId: activeProjectIdRef.current });
  }, [activeProjectIdRef]);

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
