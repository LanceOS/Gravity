import React, { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { queryKeys, CACHE_CONFIGS } from '../../utils/queryClient';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useAuth } from '../auth/AuthContext';
import type { CycleContextType } from './CycleContext.types';
import type { Cycle } from '../../types/domain';

export const CycleContext = createContext<CycleContextType | undefined>(undefined);

export const useCycles = () => {
  const context = useContext(CycleContext);
  if (!context) {
    throw new Error('useCycles must be used within a CycleProvider');
  }
  return context;
};

export const CycleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeProjectId } = useActiveProject();
  const { currentUser } = useAuth();

  const cyclesQuery = useQuery({
    queryKey: queryKeys.cycles(activeProjectId),
    queryFn: () => apiClient.get<Cycle[]>(`/cycles`, { projectId: activeProjectId }),
    enabled: !!activeProjectId && !!currentUser,
    ...CACHE_CONFIGS.metadata,
  });

  const value = useMemo<CycleContextType>(() => ({
    cycles: cyclesQuery.data || [],
    isLoading: cyclesQuery.isLoading,
    error: cyclesQuery.error,
  }), [cyclesQuery.data, cyclesQuery.isLoading, cyclesQuery.error]);

  return (
    <CycleContext.Provider value={value}>
      {children}
    </CycleContext.Provider>
  );
};
