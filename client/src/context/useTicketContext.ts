import { useContext } from 'react';
import { TicketContext } from './TicketContextContext';
import type { TicketContextType } from './TicketContext.types';

/**
 * @deprecated Prefer narrow domain hooks like useAuth(), useTheme(), useTicketList(), and useTicketFilters().
 */
export function useTicketContext(): TicketContextType {
  const context = useContext(TicketContext);
  if (!context) {
    throw new Error('useTicketContext must be used within a TicketProvider');
  }

  return context;
}
