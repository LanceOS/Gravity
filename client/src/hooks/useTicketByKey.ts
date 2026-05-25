import { useState, useEffect } from 'react';
import { useTickets } from '../context/TicketContext';

// Global cache for pending fetches to avoid duplicate concurrent calls for the same key
const fetchCache: Record<string, Promise<any>> = {};
// Global cache for resolved ticket details to avoid refetching during the app lifecycle
const resolvedCache: Record<string, any> = {};

/**
 * @description A custom React hook that looks up and fetches ticket details by its key.
 * It first attempts to resolve the ticket from the local context list of tickets.
 * If not found, it checks if there is already a pending query or a resolved result for this key
 * globally, to deduplicate concurrent requests and avoid client-side N+1 fetch cascades.
 * @param {string} ticketKey - The ticket key to search for (e.g. 'PROJ-1').
 * @returns {Object} An object containing the ticketInfo, loading state, and error (if any).
 */
export function useTicketByKey(ticketKey: string) {
  const { tickets, currentUser } = useTickets();
  const [ticketInfo, setTicketInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const normalizedKey = ticketKey.toUpperCase();
  const localTicket = tickets.find(t => t.key.toUpperCase() === normalizedKey);

  useEffect(() => {
    // 1. Resolve from local state immediately if available
    if (localTicket) {
      setTicketInfo(localTicket);
      setError(null);
      setLoading(false);
      return;
    }

    // 2. Resolve from globally resolved cache if available
    if (resolvedCache[normalizedKey]) {
      setTicketInfo(resolvedCache[normalizedKey]);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    // 3. Initiate fetching or hook into existing pending query
    if (!fetchCache[normalizedKey]) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentUser?.id) {
        headers['X-User-Id'] = currentUser.id;
      }

      fetchCache[normalizedKey] = fetch(`/api/v1/tickets/key/${normalizedKey}`, { headers })
        .then(async res => {
          if (res.ok) return res.json();

          let serverError: string | undefined;
          try {
            const errorBody = await res.json();
            if (errorBody && typeof errorBody.error === 'string') {
              serverError = errorBody.error;
            }
          } catch {
            // Ignore JSON parsing failures and fall back to status-based messages.
          }

          if (res.status === 401) {
            throw new Error(serverError || 'Unauthorized');
          }
          if (res.status === 403) {
            throw new Error(serverError || 'Forbidden');
          }
          if (res.status === 404) {
            throw new Error(serverError || 'Ticket not found');
          }

          throw new Error(serverError || `Request failed with status ${res.status}`);
        })
        .then(data => {
          resolvedCache[normalizedKey] = data;
          return data;
        })
        .catch(err => {
          // Evict from active fetchCache so it can be retried on next hook mount
          delete fetchCache[normalizedKey];
          throw err;
        });
    }

    fetchCache[normalizedKey]
      .then(data => {
        if (active) {
          setTicketInfo(data);
          setError(null);
        }
      })
      .catch(err => {
        if (active) {
          setError(err);
          setTicketInfo(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [normalizedKey, localTicket, currentUser?.id]);

  return { ticketInfo, loading, error };
}
