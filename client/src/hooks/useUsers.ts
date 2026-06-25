import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../utils/queryClient';
import type { User } from '../types/domain';

type UserDirectoryScope = {
  projectId?: string;
  workspaceId?: string;
  teamId?: string;
};

export function useUsersQuery(enabledOrScope: UserDirectoryScope | boolean = true, enabled = true) {
  const hasScope = typeof enabledOrScope === 'object' && enabledOrScope !== null;
  const scope = hasScope ? enabledOrScope : undefined;
  const normalizedScope = scope
    ? Object.fromEntries(Object.entries(scope).filter(([, value]) => Boolean(value))) as UserDirectoryScope
    : undefined;
  const shouldRun = hasScope ? enabled : enabledOrScope;
  const hasValidScope = !!(normalizedScope && (normalizedScope.projectId || normalizedScope.workspaceId || normalizedScope.teamId));

  const queryParams = scope
    ? Object.fromEntries(Object.entries(scope).filter(([, value]) => Boolean(value))) as UserDirectoryScope
    : undefined;

  const usersQuery = useQuery({
    queryKey: normalizedScope ? queryKeys.users(normalizedScope) : queryKeys.users(),
    queryFn: () => apiClient.get<User[]>(`/users`, { params: queryParams }),
    enabled: shouldRun && hasValidScope,
    ...CACHE_CONFIGS.metadata,
  });

  return {
    users: usersQuery.data || [],
    loading: usersQuery.isLoading,
  };
}
