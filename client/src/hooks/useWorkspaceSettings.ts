import { useCallback, useEffect, useState } from 'react';
import type { User } from '../context/TicketContext';
import type { WorkspaceJoinMode } from './useWorkspaceDirectory';

export interface WorkspaceAdminSettings {
  workspaceId: string;
  key: string;
  hostUrl: string;
  joinMode: WorkspaceJoinMode;
  workspaceKey: string;
  disabledMcpTools: string[];
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
  code: string;
  label: string;
  expiresAt: string | null;
  revokedAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
  createdByName: string;
  pendingJoinRequestCount: number;
}

export interface CreateWorkspaceInviteInput {
  label: string;
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
  disabledMcpTools: [],
});

function normalizeWorkspaceInvite(invite: Record<string, unknown>): WorkspaceInvite {
  return {
    id: String(invite.id ?? ''),
    code: String(invite.code ?? ''),
    label: String(invite.label ?? ''),
    expiresAt: invite.expiresAt ? String(invite.expiresAt) : null,
    revokedAt: invite.revokedAt ? String(invite.revokedAt) : null,
    maxUses: invite.maxUses ? Number(invite.maxUses) : null,
    useCount: Number(invite.useCount ?? 0),
    createdAt: String(invite.createdAt ?? ''),
    createdByName: String(invite.createdByName ?? ''),
    pendingJoinRequestCount: Number(invite.pendingJoinRequestCount ?? 0),
  };
}

export function useWorkspaceSettings({ currentUser, activeWorkspaceId }: UseWorkspaceSettingsOptions) {
  const [settings, setSettings] = useState<WorkspaceAdminSettings>(() => defaultSettings(activeWorkspaceId));
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [joinRequests, setJoinRequests] = useState<WorkspaceJoinRequest[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
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
      setDeleteError(null);
      return;
    }

    setSettingsLoading(true);
    setInvitesLoading(true);
    setSaveError(null);
    setInviteError(null);

    try {
      const [settingsResponse, membersResponse, invitesResponse, joinRequestsResponse] = await Promise.all([
        fetch(`/api/v1/workspaces/${activeWorkspaceId}/settings`, {
          headers: { 'X-User-Id': currentUser.id },
        }),
        fetch(`/api/v1/workspaces/${activeWorkspaceId}/members`, {
          headers: { 'X-User-Id': currentUser.id },
        }),
        fetch(`/api/v1/workspaces/${activeWorkspaceId}/invites`, {
          headers: { 'X-User-Id': currentUser.id },
        }),
        fetch(`/api/v1/workspaces/${activeWorkspaceId}/join-requests`, {
          headers: { 'X-User-Id': currentUser.id },
        }),
      ]);

      const joinRequestsForbidden = joinRequestsResponse.status === 403;

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

      if (!joinRequestsResponse.ok && !joinRequestsForbidden) {
        throw new Error(joinRequestsData.error || 'Failed to load workspace join requests.');
      }

      setSettings({
        workspaceId: settingsData.workspaceId || activeWorkspaceId,
        key: settingsData.key || '',
        hostUrl: settingsData.hostUrl || '',
        joinMode: settingsData.joinMode === 'auto_join' ? 'auto_join' : 'approval_required',
        workspaceKey: settingsData.workspaceKey || '',
        disabledMcpTools: Array.isArray(settingsData.disabledMcpTools) ? settingsData.disabledMcpTools : [],
      });
      setMembers(Array.isArray(membersData) ? membersData : []);
      setInvites(Array.isArray(invitesData) ? invitesData.map((invite) => normalizeWorkspaceInvite(invite as Record<string, unknown>)) : []);
      setJoinRequests(!joinRequestsForbidden && Array.isArray(joinRequestsData) ? joinRequestsData : []);
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : 'Failed to load workspace administration data.';
      setSaveError(message);
      setMembers([]);
      setInvites([]);
      setJoinRequests([]);
    } finally {
      setSettingsLoading(false);
      setInvitesLoading(false);
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
          disabledMcpTools: settings.disabledMcpTools || [],
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
        disabledMcpTools: Array.isArray(data.disabledMcpTools) ? data.disabledMcpTools : settings.disabledMcpTools || [],
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
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser.id,
        },
        body: JSON.stringify({
          createdBy: currentUser.id,
          label: input.label,
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
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/invites/${inviteId}/revoke`, {
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
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser.id,
        },
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
    approveLoadingId,
    revokeLoadingId,
    deleteLoading,
    deleteError,
    updateSettings,
    saveSettings,
    createInvite,
    revokeInvite,
    approveJoinRequest,
    refreshWorkspaceAdmin,
    deleteWorkspace,
    clearDeleteError,
    updateMemberActivity,
  };
}
