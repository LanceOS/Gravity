import { useState } from 'react';

import type { WorkspaceSummary } from '../../../hooks/useWorkspaceDirectory';
import { useWorkspaceSelectionState } from './useWorkspaceSelectionState';

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

  useWorkspaceSelectionState({
    currentUser,
    workspaces,
    workspacesLoading,
    workspacesResolvedForCurrentUser,
    activeWorkspaceId,
    setActiveWorkspaceId,
    setWorkspaceReady,
  });

  return {
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaceReady,
  };
}
