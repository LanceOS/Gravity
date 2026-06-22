import { createContext, useContext, useMemo, type FC, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../../utils/queryClient';
import { useAuth } from '../auth/AuthContext';
import type { User } from '../../types/domain';

export interface UserDirectoryContextType {
  users: User[];
  isLoading: boolean;
}

const UserDirectoryContext = createContext<UserDirectoryContextType | undefined>(undefined);

export const UserDirectoryProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();

  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => apiClient.get<User[]>(`/users`),
    enabled: !!currentUser,
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
