import { useCallback, useEffect, useState } from 'react';
import type { User } from '../context/TicketContext';

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
}

export interface CreateWorkspaceInput {
  name: string;
  description: string;
  key: string;
  workspaceKey?: string;
  defaultProjectName?: string;
  defaultProjectKey?: string;
}

export interface ValidatePeerInviteInput {
  email: string;
  validationCode: string;
  inviteUrl: string;
  username: string;
  passwordHash: string;
}

interface UseWorkspaceDirectoryOptions {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
}

export function useWorkspaceDirectory({ currentUser, setCurrentUser }: UseWorkspaceDirectoryOptions) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | 'validate' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      setWorkspaces([]);
      setResolvedUserId(null);
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/workspaces');
      const data = await response.json();

      if (response.status === 401) {
        setCurrentUser(null);
        setWorkspaces([]);
        return [];
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load workspaces.');
      }

      setWorkspaces(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data : [];
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load workspaces.';
      setError(message);
      setWorkspaces([]);
      return [];
    } finally {
      setResolvedUserId(currentUser.id);
      setLoading(false);
    }
  }, [currentUser]);

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
      const response = await fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          ownerId: currentUser.id,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create workspace.');
      }

      setSuccessMessage('Workspace created.');
      await refreshWorkspaces();
      return data.workspace as WorkspaceSummary;
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'Failed to create workspace.';
      setError(message);
      return null;
    } finally {
      setPendingAction(null);
    }
  }, [currentUser, refreshWorkspaces]);

  const requestJoinByInvite = useCallback(async (inviteCode: string, message?: string) => {
    if (!currentUser) {
      return false;
    }

    setPendingAction('join');
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/v1/workspaces/invites/${encodeURIComponent(inviteCode)}/join-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          message: message || '',
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send workspace join request.');
      }

      setSuccessMessage('Join request sent. The workspace owner must approve it before you can connect.');
      return true;
    } catch (joinError) {
      const messageText = joinError instanceof Error ? joinError.message : 'Failed to send workspace join request.';
      setError(messageText);
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [currentUser]);

  const validatePeerInvite = useCallback(async (input: ValidatePeerInviteInput) => {
    setPendingAction('validate');
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(input.inviteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: input.email,
          validation_code: input.validationCode,
          invite_url: input.inviteUrl,
          username: input.username,
          password_hash: input.passwordHash,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to validate the peer invite.');
      }

      setCurrentUser({
        id: data.guest_profile.id,
        name: data.guest_profile.username,
        email: input.email,
        avatar: '',
        role: data.guest_profile.role || 'guest_contributor',
        tutorial_completed: 0,
      });
      setSuccessMessage('Peer invite validated. Switched into the guest workspace profile.');
      return true;
    } catch (validationError) {
      const messageText = validationError instanceof Error ? validationError.message : 'Failed to validate the peer invite.';
      setError(messageText);
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [setCurrentUser]);

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
    validatePeerInvite,
  };
}