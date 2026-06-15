import { useEffect, useState } from 'react';

import { getActiveWorkspaceStorageKey } from '../../../modules/workspaces';
import type { WorkspaceSummary } from '../../../hooks/useWorkspaceDirectory';
import { useLocalStorageString } from '../../../hooks/useLocalStorageString';

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
  const { readValue, writeValue } = useLocalStorageString({
    key: currentUser ? getActiveWorkspaceStorageKey(currentUser.id) : null,
  });

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

    const storedWorkspaceId = readValue();
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
    readValue,
    workspaces,
    workspacesLoading,
    workspacesResolvedForCurrentUser,
  ]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    writeValue(activeWorkspaceId || null);
  }, [activeWorkspaceId, currentUser, writeValue]);

  return {
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaceReady,
  };
}
