import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '../context/TicketContextContext';
import { ApiError } from '../utils/apiClient';
import {
  workspaceDirectoryService as defaultWorkspaceDirectoryService,
  type WorkspaceDirectoryService,
} from '../services/workspaceDirectoryService';

export type WorkspaceJoinMode = 'approval_required' | 'auto_join';

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string;
  key: string;
  defaultProjectId: string | null;
  hostUrl: string;
  joinMode: WorkspaceJoinMode;
  projectCount: number;
  memberCount: number;
  pendingJoinRequestCount: number;
  memberRole?: string;
  hierarchyMode?: 'flat' | 'teams';
}

export interface CreateWorkspaceInput {
  name: string;
  description: string;
  key: string;
  workspaceKey?: string;
  hierarchyMode?: 'teams' | 'flat';
}



interface UseWorkspaceDirectoryOptions {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  workspaceDirectoryService?: WorkspaceDirectoryService;
}

export function useWorkspaceDirectory({
  currentUser,
  setCurrentUser,
  workspaceDirectoryService = defaultWorkspaceDirectoryService,
}: UseWorkspaceDirectoryOptions) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const refreshRequestIdRef = useRef(0);

  const refreshWorkspaces = useCallback(async () => {
    const requestId = ++refreshRequestIdRef.current;
    const requestedUserId = currentUser?.id ?? null;

    if (!currentUser) {
      setLoading(false);
      setWorkspaces([]);
      setResolvedUserId(null);
      setError(null);
      return [];
    }

    if (resolvedUserId !== requestedUserId) {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await workspaceDirectoryService.listWorkspaces(currentUser.id);

      if (requestId !== refreshRequestIdRef.current) {
        return [];
      }

      setWorkspaces(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data : [];
    } catch (loadError) {
      if (requestId !== refreshRequestIdRef.current) {
        return [];
      }

      if (loadError instanceof ApiError && loadError.status === 401) {
        setCurrentUser(null);
      }

      const message = loadError instanceof Error ? loadError.message : 'Failed to load workspaces.';
      setError(message);
      setWorkspaces([]);
      return [];
    } finally {
      if (requestId === refreshRequestIdRef.current) {
        setResolvedUserId(requestedUserId);
        setLoading(false);
      }
    }
  }, [currentUser, setCurrentUser, workspaceDirectoryService]);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const createWorkspace = useCallback(async (input: CreateWorkspaceInput) => {
    if (!currentUser) {
      return null;
    }

    setPendingAction('create');
    setError(null);
    setSuccessMessage(null);

    try {
      const data = await workspaceDirectoryService.createWorkspace(currentUser.id, input);
      setSuccessMessage('Workspace created.');
      await refreshWorkspaces();
      return data;
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'Failed to create workspace.';
      setError(message);
      return null;
    } finally {
      setPendingAction(null);
    }
  }, [currentUser, refreshWorkspaces, workspaceDirectoryService]);

  const requestJoinByInvite = useCallback(async (inviteCode: string, message?: string) => {
    if (!currentUser) {
      return false;
    }

    setPendingAction('join');
    setError(null);
    setSuccessMessage(null);

    try {
      await workspaceDirectoryService.requestJoinByInvite(currentUser.id, inviteCode, message);
      setSuccessMessage('Join request sent. The workspace owner must approve it before you can connect.');
      return true;
    } catch (joinError) {
      const messageText = joinError instanceof Error ? joinError.message : 'Failed to send workspace join request.';
      setError(messageText);
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [currentUser, workspaceDirectoryService, refreshWorkspaces]);



  return {
    workspaces,
    loading,
    resolvedUserId,
    pendingAction,
    error,
    successMessage,
    refreshWorkspaces,
    createWorkspace,
    requestJoinByInvite,
  };
}
