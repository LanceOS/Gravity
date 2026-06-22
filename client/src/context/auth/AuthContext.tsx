import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type FC, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from './authClient';
import type { User } from '../../types/domain';

export interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeCurrentUser(session: { user?: any } | null | undefined): User | null {
  if (!session?.user) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    avatar: session.user.image || '',
    role: 'user',
    tutorial_completed: (session.user as any).tutorialCompleted ?? (session.user as any).tutorial_completed ?? false,
  };
}

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { data: session, isPending: authLoading } = authClient.useSession();
  const currentUser = useMemo(() => normalizeCurrentUser(session), [session]);
  const previousUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (currentUser?.id !== previousUserIdRef.current) {
      if (previousUserIdRef.current !== undefined) {
        queryClient.clear();
      }

      previousUserIdRef.current = currentUser?.id;
    }
  }, [currentUser?.id, queryClient]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      currentUser,
      loading: authLoading,
      isAuthenticated: !!currentUser,
      signOut,
    }),
    [authLoading, currentUser, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export { AuthContext };
