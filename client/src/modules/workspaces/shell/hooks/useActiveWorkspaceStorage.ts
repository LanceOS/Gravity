import { useEffect } from 'react';

import { getActiveWorkspaceStorageKey } from '../utils/workspaceStorage';
import type { User } from '../../../../types/domain';

interface UseActiveWorkspaceStorageArgs {
  currentUser: User | null;
  activeWorkspaceId: string;
}

export function useActiveWorkspaceStorage({ currentUser, activeWorkspaceId }: UseActiveWorkspaceStorageArgs) {
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') {
      return;
    }

    const storageKey = getActiveWorkspaceStorageKey(currentUser.id);
    if (!activeWorkspaceId) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, activeWorkspaceId);
  }, [activeWorkspaceId, currentUser]);
}
