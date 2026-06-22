import { createContext, useContext, useEffect, useMemo, useRef, type FC, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../../utils/queryClient';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useAuth } from '../auth/AuthContext';
import type { Ticket } from '../../types/domain';

export interface TicketListContextType {
  tickets: Ticket[];
  ticketMap: Map<string, Ticket>;
  isLoading: boolean;
}

const TicketListContext = createContext<TicketListContextType | undefined>(undefined);

export const TicketListProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { activeProjectId } = useActiveProject();
  const previousTicketsRef = useRef<Ticket[] | undefined>(undefined);
  const previousContextKeyRef = useRef<string | undefined>(undefined);
  const currentContextKey = `${currentUser?.id ?? 'anonymous'}:${activeProjectId ?? ''}`;

  const ticketsQuery = useQuery({
    queryKey: queryKeys.tickets(activeProjectId),
    queryFn: async () => {
      const data = await apiClient.get<Ticket[]>(`/tickets`, { projectId: activeProjectId });
      return data;
    },
    enabled: !!activeProjectId && !!currentUser,
    ...CACHE_CONFIGS.ticketsList,
  });

  const tickets = ticketsQuery.data ?? previousTicketsRef.current ?? [];

  useEffect(() => {
    if (Array.isArray(ticketsQuery.data)) {
      previousTicketsRef.current = ticketsQuery.data;
      previousContextKeyRef.current = currentContextKey;
      return;
    }

    if (!currentUser || !activeProjectId) {
      previousTicketsRef.current = undefined;
      previousContextKeyRef.current = currentContextKey;
      return;
    }

    if (ticketsQuery.isError && previousContextKeyRef.current !== currentContextKey) {
      previousTicketsRef.current = undefined;
      previousContextKeyRef.current = currentContextKey;
    }
  }, [activeProjectId, currentContextKey, currentUser, ticketsQuery.data, ticketsQuery.isError]);

  const ticketMap = useMemo(
    () => new Map(tickets.map((ticket) => [ticket.key.toUpperCase(), ticket])),
    [tickets]
  );

  const value = useMemo<TicketListContextType>(
    () => ({
      tickets,
      ticketMap,
      isLoading: ticketsQuery.isLoading,
    }),
    [ticketMap, tickets, ticketsQuery.isLoading]
  );

  return <TicketListContext.Provider value={value}>{children}</TicketListContext.Provider>;
};

export function useTicketList(): TicketListContextType {
  const context = useContext(TicketListContext);
  if (!context) {
    throw new Error('useTicketList must be used within a TicketListProvider');
  }

  return context;
}

export { TicketListContext };
