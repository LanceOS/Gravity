import { createContext } from 'react';
import type { TicketContextType } from './TicketContext';

export const TicketContext = createContext<TicketContextType | undefined>(undefined);

export type * from './TicketContext';
