import { createContext } from 'react';
import type { TicketContextType } from './TicketContext.types';

export const TicketContext = createContext<TicketContextType | undefined>(undefined);

export type * from './TicketContext.types';
export { useTicketContext } from './useTicketContext';
