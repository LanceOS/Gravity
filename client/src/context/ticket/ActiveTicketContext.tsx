import React, { createContext, useContext } from 'react';
import type { Ticket } from '../../types/domain';

export type ActiveTicketContextValue = {
  activeTicket: Ticket | null;
  setActiveTicket: React.Dispatch<React.SetStateAction<Ticket | null>>;
};

export const ActiveTicketContext = createContext<ActiveTicketContextValue | undefined>(undefined);

export function useActiveTicket(): ActiveTicketContextValue {
  const context = useContext(ActiveTicketContext);
  if (!context) {
    throw new Error('useActiveTicket must be used within WorkspaceTicketProviders or TicketProvider');
  }

  return context;
}
