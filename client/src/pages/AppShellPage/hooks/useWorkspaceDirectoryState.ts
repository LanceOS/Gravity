import { useEffect, useState } from 'react';

import { getActiveWorkspaceStorageKey } from './useWorkspaceLifecycle';
import type { WorkspaceSummary } from '../../../hooks/useWorkspaceDirectory';

interface UseWorkspaceDirectoryStateArgs {
  currentUser: { id: string } | null;
  workspaces: WorkspaceSummary[];
  workspacesLoading: boolean;
  workspacesResolvedForCurrentUser: boolean;
}

interface UseWorkspaceDirectoryStateResult {
  activeWorkspaceId: string;
  setActiveWorkspaceId: (workspaceId: string) => void;
  workspaceReady: boolean;
}

export function useWorkspaceDirectoryState({
  currentUser,
  workspaces,
  workspacesLoading,
  workspacesResolvedForCurrentUser,
}: UseWorkspaceDirectoryStateArgs): UseWorkspaceDirectoryStateResult {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [workspaceReady, setWorkspaceReady] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      setWorkspaceReady(false);
      setActiveWorkspaceId('');
      return;
    }

    if (!workspacesResolvedForCurrentUser || workspacesLoading) {
      return;
    }

    if (workspaces.length === 0) {
      setWorkspaceReady(true);
      setActiveWorkspaceId('');
      return;
    }

    const storageKey = getActiveWorkspaceStorageKey(currentUser.id);
    const storedWorkspaceId = window.localStorage.getItem(storageKey);
    const nextWorkspaceId =
      storedWorkspaceId && workspaces.some((workspace) => workspace.id === storedWorkspaceId)
        ? storedWorkspaceId
        : workspaces[0].id;

    if (nextWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(nextWorkspaceId);
    }

    setWorkspaceReady(true);
  }, [
    activeWorkspaceId,
    currentUser,
    workspaces,
    workspacesLoading,
    workspacesResolvedForCurrentUser,
  ]);

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

  return {
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaceReady,
  };
}
