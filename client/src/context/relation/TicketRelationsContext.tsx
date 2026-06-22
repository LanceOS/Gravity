import { createContext, useContext, useMemo, type FC, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTicketRelationActions } from '../../hooks/useTicketRelationActions';
import { useActiveTicket } from '../ticket/ActiveTicketContext';
import { useTicketList } from '../ticket/TicketListContext';
import { useTicketDetailContext } from '../ticket/TicketDetailContext';
import type { TicketRelationsContextType, TicketRelationsContextValueArgs } from './TicketRelationsContext.types';

export const TicketRelationsContext = createContext<TicketRelationsContextType | undefined>(undefined);

export function useTicketRelationsContext(): TicketRelationsContextType {
  const context = useContext(TicketRelationsContext);
  if (!context) {
    throw new Error('useTicketRelationsContext must be used within a TicketRelationsContext provider');
  }

  return context;
}

export function useTicketRelationsContextValue(args: TicketRelationsContextValueArgs): TicketRelationsContextType {
  const { activeTicketDetail } = args;
  const {
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  } = useTicketRelationActions(args);

  return useMemo(() => ({
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  }), [
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  ]);
}

export const TicketRelationsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { tickets } = useTicketList();
  const { activeTicket } = useActiveTicket();
  const { activeTicketDetail } = useTicketDetailContext();

  const value = useTicketRelationsContextValue({
    queryClient,
    tickets,
    activeTicket,
    activeTicketDetail,
  });

  return <TicketRelationsContext.Provider value={value}>{children}</TicketRelationsContext.Provider>;
};
