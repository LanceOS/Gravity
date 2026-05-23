import { useCallback, useEffect, useState } from 'react';
import type { User } from '../context/TicketContext';
import type { WorkspaceJoinMode } from './useWorkspaceDirectory';

export interface WorkspaceAdminSettings {
  workspaceId: string;
  key: string;
  hostUrl: string;
  joinMode: WorkspaceJoinMode;
  workspaceKey: string;
}

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  createdAt: string;
  lastActiveAt?: string | null;
}

export interface WorkspaceInvite {
  id: string;
  email: string;
  inviteUrl: string;
  validationCode: string;
  workspacePrivateKey: string;
  expiresAt: string;
  isUsed: boolean;
  usedAt: string | null;
  revokedAt: string | null;
  guestUsername: string | null;
  createdAt: string;
}

export interface CreateWorkspaceInviteInput {
  email: string;
  expirationHours: number;
}

export interface WorkspaceJoinRequest {
  id: string;
  requestingUserId: string | null;
  requesterName: string;
  requesterEmail: string;
  requesterAvatar: string | null;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedByName?: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface FederationConnectionSyncState {
  consecutiveFailures: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastAppliedCount: number;
}

export interface FederationConnection {
  id: string;
  workspaceId: string;
  workspaceName: string;
  hostUrl: string;
  hostDisplayName: string;
  hostPublicKey: string;
  lastSyncedEventId: number;
  status: string;
  createdAt: string;
  syncState: FederationConnectionSyncState;
}

export interface FederationConnectionRetryResult {
  appliedCount: number;
  lastSyncedEventId: number;
}

interface UseWorkspaceSettingsOptions {
  currentUser: User | null;
  activeWorkspaceId: string;
}

const defaultSettings = (workspaceId: string): WorkspaceAdminSettings => ({
  workspaceId,
  key: '',
  hostUrl: '',
  joinMode: 'approval_required',
  workspaceKey: '',
});

function normalizeWorkspaceInvite(invite: Record<string, unknown>): WorkspaceInvite {
  return {
    id: String(invite.id ?? ''),
    email: String(invite.email ?? ''),
    inviteUrl: String(invite.invite_url ?? invite.inviteUrl ?? ''),
    validationCode: String(invite.validation_code ?? invite.validationCode ?? ''),
    workspacePrivateKey: String(invite.workspace_private_key ?? invite.workspacePrivateKey ?? ''),
    expiresAt: String(invite.expires_at ?? invite.expiresAt ?? ''),
    isUsed: Boolean(invite.is_used ?? invite.isUsed),
    usedAt: invite.used_at ? String(invite.used_at) : invite.usedAt ? String(invite.usedAt) : null,
    revokedAt: invite.revoked_at ? String(invite.revoked_at) : invite.revokedAt ? String(invite.revokedAt) : null,
    guestUsername: invite.guest_username ? String(invite.guest_username) : invite.guestUsername ? String(invite.guestUsername) : null,
    createdAt: String(invite.created_at ?? invite.createdAt ?? ''),
  };
}

function normalizeFederationConnection(connection: Record<string, unknown>): FederationConnection {
  const rawSyncState =
    connection.syncState && typeof connection.syncState === 'object' && !Array.isArray(connection.syncState)
      ? (connection.syncState as Record<string, unknown>)
      : {};

  return {
    id: String(connection.id ?? ''),
    workspaceId: String(connection.workspaceId ?? ''),
    workspaceName: String(connection.workspaceName ?? ''),
    hostUrl: String(connection.hostUrl ?? ''),
    hostDisplayName: String(connection.hostDisplayName ?? ''),
    hostPublicKey: String(connection.hostPublicKey ?? ''),
    lastSyncedEventId: Number(connection.lastSyncedEventId ?? 0),
    status: String(connection.status ?? 'unknown'),
    createdAt: String(connection.createdAt ?? ''),
    syncState: {
      consecutiveFailures: Number(rawSyncState.consecutiveFailures ?? 0),
      nextAttemptAt: typeof rawSyncState.nextAttemptAt === 'string' ? rawSyncState.nextAttemptAt : null,
      lastAttemptAt: typeof rawSyncState.lastAttemptAt === 'string' ? rawSyncState.lastAttemptAt : null,
      lastSuccessAt: typeof rawSyncState.lastSuccessAt === 'string' ? rawSyncState.lastSuccessAt : null,
      lastError: typeof rawSyncState.lastError === 'string' ? rawSyncState.lastError : null,
      lastAppliedCount: Number(rawSyncState.lastAppliedCount ?? 0),
    },
  };
}

export function useWorkspaceSettings({ currentUser, activeWorkspaceId }: UseWorkspaceSettingsOptions) {
  const [settings, setSettings] = useState<WorkspaceAdminSettings>(() => defaultSettings(activeWorkspaceId));
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [joinRequests, setJoinRequests] = useState<WorkspaceJoinRequest[]>([]);
  const [federationConnections, setFederationConnections] = useState<FederationConnection[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [retryingConnectionId, setRetryingConnectionId] = useState<string | null>(null);
  const [approveLoadingId, setApproveLoadingId] = useState<string | null>(null);
  const [revokeLoadingId, setRevokeLoadingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refreshWorkspaceAdmin = useCallback(async () => {
    if (!currentUser || !activeWorkspaceId) {
      setSettings(defaultSettings(activeWorkspaceId));
      setMembers([]);
      setInvites([]);
      setJoinRequests([]);
      setFederationConnections([]);
      setConnectionsError(null);
      setDeleteError(null);
      return;
    }

    setSettingsLoading(true);
    setInvitesLoading(true);
    setConnectionsLoading(true);
    setSaveError(null);
    setInviteError(null);
    setConnectionsError(null);

    try {
      const [settingsResponse, membersResponse, invitesResponse, joinRequestsResponse] = await Promise.all([
        fetch(`/api/v1/workspaces/${activeWorkspaceId}/settings`, {
          headers: { 'X-User-Id': currentUser.id },
        }),
        fetch(`/api/v1/workspaces/${activeWorkspaceId}/members`, {
          headers: { 'X-User-Id': currentUser.id },
        }),
        fetch(`/api/v1/workspaces/${activeWorkspaceId}/peer-invites`, {
          headers: { 'X-User-Id': currentUser.id },
        }),
        fetch(`/api/v1/workspaces/${activeWorkspaceId}/join-requests`, {
          headers: { 'X-User-Id': currentUser.id },
        }),
      ]);

      const [settingsData, membersData, invitesData, joinRequestsData] = await Promise.all([
        settingsResponse.json(),
        membersResponse.json(),
        invitesResponse.json(),
        joinRequestsResponse.json(),
      ]);

      if (!settingsResponse.ok) {
        throw new Error(settingsData.error || 'Failed to load workspace settings.');
      }

      if (!membersResponse.ok) {
        throw new Error(membersData.error || 'Failed to load workspace members.');
      }

      if (!invitesResponse.ok) {
        throw new Error(invitesData.error || 'Failed to load workspace invites.');
      }

      if (!joinRequestsResponse.ok) {
        throw new Error(joinRequestsData.error || 'Failed to load workspace join requests.');
      }

      setSettings({
        workspaceId: settingsData.workspaceId || activeWorkspaceId,
        key: settingsData.key || '',
        hostUrl: settingsData.hostUrl || '',
        joinMode: settingsData.joinMode === 'auto_join' ? 'auto_join' : 'approval_required',
        workspaceKey: settingsData.workspaceKey || '',
      });
      setMembers(Array.isArray(membersData) ? membersData : []);
      setInvites(Array.isArray(invitesData) ? invitesData.map((invite) => normalizeWorkspaceInvite(invite as Record<string, unknown>)) : []);
      setJoinRequests(Array.isArray(joinRequestsData) ? joinRequestsData : []);

      try {
        const connectionsResponse = await fetch(`/api/v1/federation/connections?workspaceId=${encodeURIComponent(activeWorkspaceId)}`, {
          headers: { 'X-User-Id': currentUser.id },
        });
        const connectionsData = await connectionsResponse.json();

        if (!connectionsResponse.ok) {
          throw new Error(connectionsData.error || 'Failed to load federation connections.');
        }

        setFederationConnections(
          Array.isArray(connectionsData)
            ? connectionsData.map((connection) => normalizeFederationConnection(connection as Record<string, unknown>))
            : [],
        );
      } catch (connectionError) {
        const message = connectionError instanceof Error ? connectionError.message : 'Failed to load federation connections.';
        setFederationConnections([]);
        setConnectionsError(message);
      }
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : 'Failed to load workspace administration data.';
      setSaveError(message);
      setMembers([]);
      setInvites([]);
      setJoinRequests([]);
      setFederationConnections([]);
    } finally {
      setSettingsLoading(false);
      setInvitesLoading(false);
      setConnectionsLoading(false);
    }
  }, [activeWorkspaceId, currentUser]);

  useEffect(() => {
    void refreshWorkspaceAdmin();
  }, [refreshWorkspaceAdmin]);

  useEffect(() => {
    if (!saveSuccess) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSaveSuccess(false), 2500);
    return () => window.clearTimeout(timer);
  }, [saveSuccess]);

  const updateSettings = useCallback((updates: Partial<WorkspaceAdminSettings>) => {
    setSettings((current) => ({ ...current, ...updates }));
    setSaveSuccess(false);
    setSaveError(null);
  }, []);

  const saveSettings = useCallback(async () => {
    if (!currentUser || !activeWorkspaceId) {
      return;
    }

    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser.id,
        },
        body: JSON.stringify({
          hostUrl: settings.hostUrl,
          joinMode: settings.joinMode,
          workspaceKey: settings.workspaceKey,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save workspace settings.');
      }

      setSettings({
        workspaceId: data.workspaceId || activeWorkspaceId,
        key: data.key || settings.key,
        hostUrl: data.hostUrl || '',
        joinMode: data.joinMode === 'auto_join' ? 'auto_join' : 'approval_required',
        workspaceKey: data.workspaceKey || settings.workspaceKey,
      });
      setSaveSuccess(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save workspace settings.';
      setSaveError(message);
    } finally {
      setSaveLoading(false);
    }
  }, [activeWorkspaceId, currentUser, settings]);

  const createInvite = useCallback(async (input: CreateWorkspaceInviteInput) => {
    if (!currentUser || !activeWorkspaceId) {
      return null;
    }

    setInviteLoading(true);
    setInviteError(null);

    try {
      const response = await fetch(`/api/v1/workspaces/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser.id,
        },
        body: JSON.stringify({
          workspace_id: activeWorkspaceId,
          email: input.email,
          expiration_hours: input.expirationHours,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invite.');
      }

      await refreshWorkspaceAdmin();
      return normalizeWorkspaceInvite(data as Record<string, unknown>);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create invite.';
      setInviteError(message);
      return null;
    } finally {
      setInviteLoading(false);
    }
  }, [activeWorkspaceId, currentUser, refreshWorkspaceAdmin]);

  const revokeInvite = useCallback(async (inviteId: string) => {
    if (!currentUser || !activeWorkspaceId) {
      return false;
    }

    setRevokeLoadingId(inviteId);
    setInviteError(null);

    try {
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/peer-invites/${inviteId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser.id,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to revoke invite.');
      }

      await refreshWorkspaceAdmin();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revoke invite.';
      setInviteError(message);
      return false;
    } finally {
      setRevokeLoadingId(null);
    }
  }, [activeWorkspaceId, currentUser, refreshWorkspaceAdmin]);

  const approveJoinRequest = useCallback(async (requestId: string) => {
    if (!currentUser || !activeWorkspaceId) {
      return false;
    }

    setApproveLoadingId(requestId);
    setInviteError(null);

    try {
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/join-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewerUserId: currentUser.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve join request.');
      }

      await refreshWorkspaceAdmin();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve join request.';
      setInviteError(message);
      return false;
    } finally {
      setApproveLoadingId(null);
    }
  }, [activeWorkspaceId, currentUser, refreshWorkspaceAdmin]);

  const retryFederationConnection = useCallback(async (connectionId: string) => {
    if (!currentUser || !activeWorkspaceId) {
      return null;
    }

    setRetryingConnectionId(connectionId);
    setConnectionsError(null);

    try {
      const response = await fetch(`/api/v1/federation/connections/${connectionId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser.id,
        },
        body: JSON.stringify({ reason: 'manual_retry' }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to retry federation sync.');
      }

      await refreshWorkspaceAdmin();
      return {
        appliedCount: Number(data.appliedCount ?? 0),
        lastSyncedEventId: Number(data.lastSyncedEventId ?? 0),
      } satisfies FederationConnectionRetryResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry federation sync.';
      await refreshWorkspaceAdmin();
      setConnectionsError(message);
      return null;
    } finally {
      setRetryingConnectionId(null);
    }
  }, [activeWorkspaceId, currentUser, refreshWorkspaceAdmin]);

  const deleteWorkspace = useCallback(async () => {
    if (!currentUser || !activeWorkspaceId) {
      return false;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser.id,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete workspace.');
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete workspace.';
      setDeleteError(message);
      return false;
    } finally {
      setDeleteLoading(false);
    }
  }, [activeWorkspaceId, currentUser]);

  const clearDeleteError = useCallback(() => setDeleteError(null), []);

  const updateMemberActivity = useCallback((userId: string, lastActiveAt: string) => {
    setMembers((current) =>
      current.map((member) =>
        member.id === userId ? { ...member, lastActiveAt } : member
      )
    );
  }, []);

  return {
    settings,
    settingsLoading,
    saveLoading,
    saveSuccess,
    saveError,
    members,
    invites,
    invitesLoading,
    joinRequests,
    inviteLoading,
    inviteError,
    federationConnections,
    connectionsLoading,
    connectionsError,
    retryingConnectionId,
    approveLoadingId,
    revokeLoadingId,
    deleteLoading,
    deleteError,
    updateSettings,
    saveSettings,
    createInvite,
    revokeInvite,
    approveJoinRequest,
    retryFederationConnection,
    refreshWorkspaceAdmin,
    deleteWorkspace,
    clearDeleteError,
    updateMemberActivity,
  };
}
