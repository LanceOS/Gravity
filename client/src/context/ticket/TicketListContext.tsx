import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../../utils/queryClient';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useTicketFilters } from '../filters/TicketFiltersContext';
import { ActiveTicketContext } from './ActiveTicketContext';
import {
  createTicketByIdMap,
  createTicketMap,
  createTicketsByParentMap,
  createTicketsByProjectMap,
  resolveSyncedActiveTicket,
} from './ticketListUtils';
import type { TicketListContextType, TicketListProviderProps, TicketListContextValueArgs } from './TicketListContext.types';
import type { Ticket } from '../../types/domain';

export const TicketListContext = createContext<TicketListContextType | undefined>(undefined);

export function useTicketListContext(): TicketListContextType {
  const context = useContext(TicketListContext);
  if (!context) {
    throw new Error('useTicketListContext must be used within a TicketListProvider');
  }

  return context;
}

export const useTicketList = useTicketListContext;

export function useTicketListContextValue({
  currentUser,
}: TicketListContextValueArgs): TicketListContextType {
  const { activeProjectId } = useActiveProject();
  const { filters } = useTicketFilters();
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const currentUserId = currentUser?.id ?? null;
  const [previous, setPrevious] = useState<{ userId: string | null; tickets?: Ticket[] }>({ userId: currentUserId });
  const hasUserChanged = previous.userId !== currentUserId;
  const isProjectScopeAligned = !filters.projectId || filters.projectId === activeProjectId;

  const ticketsQuery = useQuery({
    queryKey: queryKeys.tickets(activeProjectId),
    queryFn: async () => {
      const data = await apiClient.get<Ticket[]>(`/tickets`, { projectId: activeProjectId });
      return data;
    },
    enabled: !!activeProjectId && isProjectScopeAligned && !!currentUser,
    ...CACHE_CONFIGS.ticketsList,
  });

  useEffect(() => {
    if (!hasUserChanged) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Commit the user transition alongside AuthProvider's cache clear; render stays masked until then.
    setPrevious({ userId: currentUserId });
    setActiveTicket(null);
  }, [currentUserId, hasUserChanged]);
  if (!hasUserChanged && Array.isArray(ticketsQuery.data) && ticketsQuery.data !== previous.tickets) {
    setPrevious({ userId: currentUserId, tickets: ticketsQuery.data });
  }
  const tickets = useMemo(
    () => hasUserChanged ? [] : ticketsQuery.data ?? previous.tickets ?? [],
    [hasUserChanged, ticketsQuery.data, previous.tickets],
  );

  const ticketMap = useMemo(() => createTicketMap(tickets), [tickets]);
  const ticketById = useMemo(() => createTicketByIdMap(tickets), [tickets]);
  const ticketsByProject = useMemo(() => createTicketsByProjectMap(tickets), [tickets]);
  const ticketsByParentId = useMemo(() => createTicketsByParentMap(tickets), [tickets]);

  const syncedActiveTicket = resolveSyncedActiveTicket(activeTicket, ticketById);
  if (syncedActiveTicket) setActiveTicket(syncedActiveTicket);

  return useMemo(() => ({
    tickets,
    activeTicket: hasUserChanged ? null : activeTicket,
    setActiveTicket,
    ticketMap,
    ticketById,
    ticketsByProject,
    ticketsByParentId,
  }), [
    activeTicket,
    setActiveTicket,
    ticketMap,
    ticketById,
    ticketsByProject,
    ticketsByParentId,
    tickets,
    hasUserChanged,
  ]);
}

export function TicketListProvider({
  currentUser,
  children,
}: TicketListProviderProps) {
  const value = useTicketListContextValue({ currentUser });
  const activeTicketContextValue = useMemo(() => ({
    activeTicket: value.activeTicket,
    setActiveTicket: value.setActiveTicket,
  }), [value.activeTicket, value.setActiveTicket]);

  return (
    <TicketListContext.Provider value={value}>
      <ActiveTicketContext.Provider value={activeTicketContextValue}>
        {children}
      </ActiveTicketContext.Provider>
    </TicketListContext.Provider>
  );
}
