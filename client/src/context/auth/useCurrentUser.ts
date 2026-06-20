import { useMemo } from 'react';
import type { User } from '../../types/domain';
import { authClient } from './authClient';

function mapSessionUserToCurrentUser(sessionUser: any): User | null {
  if (!sessionUser?.id) {
    return null;
  }

  return {
    id: sessionUser.id,
    name: sessionUser.name || '',
    email: sessionUser.email || '',
    avatar: sessionUser.image || '',
    role: 'user',
    tutorial_completed: sessionUser.tutorialCompleted ?? sessionUser.tutorial_completed ?? false,
  };
}

export function useCurrentUser() {
  const { data: session, isPending: loading } = authClient.useSession();
  const currentUser = useMemo(() => mapSessionUserToCurrentUser(session?.user), [session]);

  return {
    currentUser,
    loading,
  };
}
