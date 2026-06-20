import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../../utils/queryClient';
import { useActiveProject } from '../project/ActiveProjectContext';
import { ActiveTicketContext } from './ActiveTicketContext';
import {
  createTicketByIdMap,
  createTicketMap,
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

export function useTicketListContextValue({
  currentUser,
}: TicketListContextValueArgs): TicketListContextType {
  const { activeProjectId } = useActiveProject();
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const previousTicketsRef = useRef<Ticket[] | undefined>(undefined);
  const currentUserId = currentUser?.id ?? null;
  const previousUserIdRef = useRef<string | null>(currentUserId);
  const hasUserChanged = previousUserIdRef.current !== currentUserId;

  const ticketsQuery = useQuery({
    queryKey: queryKeys.tickets(activeProjectId),
    queryFn: async () => {
      const data = await apiClient.get<Ticket[]>(`/tickets`, { projectId: activeProjectId });
      return data;
    },
    enabled: !!activeProjectId && !!currentUser,
    ...CACHE_CONFIGS.ticketsList,
  });

  const tickets = hasUserChanged ? [] : ticketsQuery.data ?? previousTicketsRef.current ?? [];

  useEffect(() => {
    if (!hasUserChanged && Array.isArray(ticketsQuery.data)) {
      previousTicketsRef.current = ticketsQuery.data;
    }
  }, [hasUserChanged, ticketsQuery.data]);

  useEffect(() => {
    if (previousUserIdRef.current === currentUserId) {
      return;
    }

    previousTicketsRef.current = undefined;
    setActiveTicket(null);
    previousUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const ticketMap = useMemo(() => createTicketMap(tickets), [tickets]);
  const ticketById = useMemo(() => createTicketByIdMap(tickets), [tickets]);
  const ticketsByProject = useMemo(() => createTicketsByProjectMap(tickets), [tickets]);

  useEffect(() => {
    const syncedActiveTicket = resolveSyncedActiveTicket(activeTicket, ticketById);
    if (syncedActiveTicket) {
      setActiveTicket(syncedActiveTicket);
    }
  }, [activeTicket, setActiveTicket, ticketById]);

  return useMemo(() => ({
    tickets,
    activeTicket: hasUserChanged ? null : activeTicket,
    setActiveTicket,
    ticketMap,
    ticketById,
    ticketsByProject,
  }), [
    activeTicket,
    setActiveTicket,
    ticketMap,
    ticketById,
    ticketsByProject,
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
