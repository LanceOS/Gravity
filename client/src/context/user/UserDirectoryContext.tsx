import { createContext, useContext, useMemo, type FC, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
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
  const { activeProjectId } = useActiveProject();
  const { projectById } = useProjectContext();
  const {
    workspaceId: workspaceIdFromRoute,
    projectId: projectIdFromRoute,
    teamId: teamIdFromRoute,
  } = useParams();
  const activeWorkspaceId = useMemo(
    () => (activeProjectId ? projectById.get(activeProjectId)?.workspaceId : ''),
    [activeProjectId, projectById],
  );

  const routedProject = projectIdFromRoute ? projectById.get(projectIdFromRoute) : undefined;
  const activeProject = activeProjectId ? projectById.get(activeProjectId) : undefined;
  const userScope = useMemo(() => {
    if (teamIdFromRoute) {
      return { teamId: teamIdFromRoute };
    }

    if (routedProject?.teamId) {
      return { teamId: routedProject.teamId };
    }

    if (workspaceIdFromRoute) {
      return { workspaceId: workspaceIdFromRoute };
    }

    if (activeProject?.id) {
      return { workspaceId: activeProject.workspaceId };
    }

    if (activeWorkspaceId) {
      return { workspaceId: activeWorkspaceId };
    }

    return null;
  }, [activeProject, activeWorkspaceId, routedProject, teamIdFromRoute, workspaceIdFromRoute]);
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
