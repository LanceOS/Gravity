import { useQuery } from '@tanstack/react-query';
import type { User } from '../../types/domain';

export const SESSION_QUERY_KEY = ['auth', 'session'] as const;

const AUTH_API_URL = '/api/auth';

async function fetchSession(): Promise<User | null> {
  const response = await fetch(`${AUTH_API_URL}/session`, { credentials: 'same-origin' });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return null;
    }
    throw new Error('Failed to fetch session');
  }
  const data = await response.json();
  return data?.user ?? null;
}

export function useSessionQuery() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: Infinity,
    retry: false,
  });
}
