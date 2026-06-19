import { useQuery } from '@tanstack/react-query';
import { useTickets } from '../context/TicketContextContext';
import { queryKeys, CACHE_CONFIGS } from '../utils/queryClient';

/**
 * @description A custom React hook that looks up and fetches ticket details by its key.
 * It first attempts to resolve the ticket from the local context list of tickets.
 * If not found, it leverages TanStack Query to fetch, cache, and deduplicate concurrent requests.
 * @param {string} ticketKey - The ticket key to search for (e.g. 'PROJ-1').
 * @returns {Object} An object containing the ticketInfo, loading state, and error (if any).
 */
export function useTicketByKey(ticketKey: string) {
  const { ticketMap, currentUser } = useTickets();
  const normalizedKey = ticketKey.trim().toUpperCase();
  const localTicket = ticketMap.get(normalizedKey);

  const query = useQuery({
    queryKey: queryKeys.ticket(normalizedKey, currentUser?.id),
    queryFn: async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentUser?.id) {
        headers['X-User-Id'] = currentUser.id;
      }

      const res = await fetch(`/api/v1/tickets/key/${normalizedKey}`, { headers });
      if (!res.ok) {
        let serverError: string | undefined;
        try {
          const errorBody = await res.json();
          if (errorBody && typeof errorBody.error === 'string') {
            serverError = errorBody.error;
          }
        } catch {
          // Ignore JSON parsing failures
        }

        if (res.status === 401) throw new Error(serverError || 'Unauthorized');
        if (res.status === 403) throw new Error(serverError || 'Forbidden');
        if (res.status === 404) throw new Error(serverError || 'Ticket not found');

        throw new Error(serverError || `Request failed with status ${res.status}`);
      }
      return res.json();
    },
    enabled: !!normalizedKey && !localTicket,
    ...CACHE_CONFIGS.ticketDetail,
  });

  return {
    ticketInfo: localTicket || query.data || null,
    loading: !localTicket && query.isLoading,
    error: localTicket ? null : (query.error as Error | null),
  };
}
