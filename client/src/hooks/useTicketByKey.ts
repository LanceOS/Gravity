import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '../context/auth/useCurrentUser';
import { useTicketListContext } from '../context/ticket/TicketListContext';
import { queryKeys, CACHE_CONFIGS } from '../utils/queryClient';
import { apiClient } from '../utils/apiClient';

/**
 * @description A custom React hook that looks up and fetches ticket details by its key.
 * It first attempts to resolve the ticket from the local context list of tickets.
 * If not found, it leverages TanStack Query to fetch, cache, and deduplicate concurrent requests.
 * @param {string} ticketKey - The ticket key to search for (e.g. 'PROJ-1').
 * @returns {Object} An object containing the ticketInfo, loading state, and error (if any).
 */
export function useTicketByKey(ticketKey: string) {
  const { ticketMap } = useTicketListContext();
  const { currentUser } = useCurrentUser();
  const normalizedKey = ticketKey.trim().toUpperCase();
  const localTicket = ticketMap.get(normalizedKey);

  const query = useQuery({
    queryKey: queryKeys.ticket(normalizedKey, currentUser?.id),
    queryFn: async () => apiClient.get<any>(`/tickets/key/${normalizedKey}`, {
      headers: currentUser?.id ? { 'X-User-Id': currentUser.id } : undefined,
    }),
    enabled: !!normalizedKey && !localTicket,
    ...CACHE_CONFIGS.ticketDetail,
  });

  return {
    ticketInfo: localTicket || query.data || null,
    loading: !localTicket && query.isLoading,
    error: localTicket ? null : (query.error as Error | null),
  };
}
