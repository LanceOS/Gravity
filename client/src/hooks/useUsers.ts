import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../utils/queryClient';
import type { User } from '../types/domain';

export function useUsersQuery(enabled = true) {
  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => apiClient.get<User[]>(`/users`),
    enabled,
    ...CACHE_CONFIGS.metadata,
  });

  return {
    users: usersQuery.data || [],
    loading: usersQuery.isLoading,
  };
}
