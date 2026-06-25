import { createContext, useContext, useMemo, type FC, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { apiClient } from '../../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../../utils/queryClient';
import { useAuth } from '../auth/AuthContext';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useProjectContext } from '../project/ProjectContext';
import type { User } from '../../types/domain';

export interface UserDirectoryContextType {
  users: User[];
  isLoading: boolean;
}

const UserDirectoryContext = createContext<UserDirectoryContextType | undefined>(undefined);

export const UserDirectoryProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { pathname } = useLocation();
  const { activeProjectId } = useActiveProject();
  const { projectById } = useProjectContext();

  const pathSegments = pathname.split('/').filter(Boolean);
  const workspaceIdFromRoute = pathSegments[0] === 'workspaces' ? pathSegments[1] : '';
  const isTeamRoute = pathSegments[0] === 'workspaces' && pathSegments[2] === 'teams';
  const teamIdFromRoute = isTeamRoute ? pathSegments[3] : '';
  const projectIdFromRoute = pathSegments.indexOf('projects') > -1 ? pathSegments[pathSegments.indexOf('projects') + 1] : '';
  const routedProject = projectIdFromRoute ? projectById.get(projectIdFromRoute) : undefined;
  const activeProject = activeProjectId ? projectById.get(activeProjectId) : undefined;
  const userScope = activeProject?.id
    ? isTeamRoute && teamIdFromRoute
      ? { teamId: teamIdFromRoute }
      : routedProject?.teamId
        ? { teamId: routedProject.teamId }
        : workspaceIdFromRoute
          ? { workspaceId: workspaceIdFromRoute }
          : null
    : isTeamRoute && teamIdFromRoute
      ? { teamId: teamIdFromRoute }
      : workspaceIdFromRoute
        ? { workspaceId: workspaceIdFromRoute }
        : null;
  const queryParams = userScope
    ? Object.fromEntries(Object.entries(userScope).filter(([, value]) => Boolean(value))) as { projectId?: string; workspaceId?: string; teamId?: string }
    : undefined;

  const usersQuery = useQuery({
    queryKey: userScope ? queryKeys.users(userScope) : queryKeys.users(),
    queryFn: () => apiClient.get<User[]>(`/users`, { params: queryParams }),
    enabled: !!currentUser && !!userScope,
    ...CACHE_CONFIGS.metadata,
  });

  const value = useMemo<UserDirectoryContextType>(
    () => ({
      users: usersQuery.data || [],
      isLoading: usersQuery.isLoading,
    }),
    [usersQuery.data, usersQuery.isLoading]
  );

  return <UserDirectoryContext.Provider value={value}>{children}</UserDirectoryContext.Provider>;
};

export function useUserDirectory(): UserDirectoryContextType {
  const context = useContext(UserDirectoryContext);
  if (!context) {
    throw new Error('useUserDirectory must be used within a UserDirectoryProvider');
  }

  return context;
}

export const useUsers = useUserDirectory;

export { UserDirectoryContext };
