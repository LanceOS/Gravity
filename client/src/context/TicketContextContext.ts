import { createContext, useContext } from 'react';
import type { TicketContextType } from './TicketContext';

export const TicketContext = createContext<TicketContextType | undefined>(undefined);

export const useTickets = () => {
  const context = useContext(TicketContext);
  if (!context) {
    throw new Error('useTickets must be used within a TicketProvider');
  }

  return context;
};

export type * from './TicketContext';
