import { createContext, useContext, useMemo } from 'react';
import { useTicketRelationActions } from '../../hooks/useTicketRelationActions';
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
  const {
    activeTicketDetail,
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
