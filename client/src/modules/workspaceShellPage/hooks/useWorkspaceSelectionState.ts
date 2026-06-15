import { useEffect, useMemo } from 'react';
import type { WorkspaceSummary } from '../../../hooks/useWorkspaceDirectory';
import { useQueryCacheString } from '../../../hooks/useQueryCacheString';

interface BaseWorkspaceSelectionArgs {
  currentUser: { id: string } | null;
  workspaces: WorkspaceSummary[];
  workspacesLoading: boolean;
  workspacesResolvedForCurrentUser: boolean;
  activeWorkspaceId: string;
  setActiveWorkspaceId: (workspaceId: string) => void;
  setWorkspaceReady: (ready: boolean) => void;
  onUserSignOut?: () => void;
  onNoWorkspaces?: () => void;
}

export function useWorkspaceSelectionState({
  currentUser,
  workspaces,
  workspacesLoading,
  workspacesResolvedForCurrentUser,
  activeWorkspaceId,
  setActiveWorkspaceId,
  setWorkspaceReady,
  onUserSignOut,
  onNoWorkspaces,
}: BaseWorkspaceSelectionArgs): void {
  const cachedWorkspaceIdKey = useMemo(
    () => (currentUser ? (['workspaceShell', 'activeWorkspaceId', { userId: currentUser.id }] as const) : null),
    [currentUser?.id]
  );

  const { readValue, writeValue } = useQueryCacheString({
    key: cachedWorkspaceIdKey,
  });

  useEffect(() => {
    if (!currentUser) {
      setWorkspaceReady(false);
      setActiveWorkspaceId('');
      onUserSignOut?.();
      return;
    }

    if (!workspacesResolvedForCurrentUser || workspacesLoading) {
      return;
    }

    if (workspaces.length === 0) {
      setActiveWorkspaceId('');
      setWorkspaceReady(true);
      onNoWorkspaces?.();
      return;
    }

    if (!activeWorkspaceId || !workspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
      const storedWorkspaceId = readValue();
      const nextWorkspaceId =
        storedWorkspaceId && workspaces.some((workspace) => workspace.id === storedWorkspaceId)
          ? storedWorkspaceId
          : workspaces[0].id;

      if (nextWorkspaceId !== activeWorkspaceId) {
        setActiveWorkspaceId(nextWorkspaceId);
      }
    }

    setWorkspaceReady(true);
  }, [
    activeWorkspaceId,
    currentUser,
    onNoWorkspaces,
    onUserSignOut,
    readValue,
    setActiveWorkspaceId,
    setWorkspaceReady,
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
}
