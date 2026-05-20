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
  createdByName?: string;
  pendingJoinRequestCount?: number;
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
});

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

  const refreshWorkspaceAdmin = useCallback(async () => {
    if (!currentUser || !activeWorkspaceId) {
      setSettings(defaultSettings(activeWorkspaceId));
      setMembers([]);
      setInvites([]);
      setJoinRequests([]);
      return;
    }

    setSettingsLoading(true);
    setInvitesLoading(true);
    setSaveError(null);
    setInviteError(null);

    try {
      const [settingsResponse, membersResponse, invitesResponse, joinRequestsResponse] = await Promise.all([
        fetch(`/api/workspaces/${activeWorkspaceId}/settings`),
        fetch(`/api/workspaces/${activeWorkspaceId}/members`),
        fetch(`/api/workspaces/${activeWorkspaceId}/invites`),
        fetch(`/api/workspaces/${activeWorkspaceId}/join-requests`),
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
      setInvites(Array.isArray(invitesData) ? invitesData : []);
      setJoinRequests(Array.isArray(joinRequestsData) ? joinRequestsData : []);
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
      const response = await fetch(`/api/workspaces/${activeWorkspaceId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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

  const createInvite = useCallback(async (label?: string) => {
    if (!currentUser || !activeWorkspaceId) {
      return null;
    }

    setInviteLoading(true);
    setInviteError(null);

    try {
      const response = await fetch(`/api/workspaces/${activeWorkspaceId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          createdBy: currentUser.id,
          label: label || '',
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invite.');
      }

      await refreshWorkspaceAdmin();
      return data as WorkspaceInvite;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create invite.';
      setInviteError(message);
      return null;
    } finally {
      setInviteLoading(false);
    }
  }, [activeWorkspaceId, currentUser, refreshWorkspaceAdmin]);

  const approveJoinRequest = useCallback(async (requestId: string) => {
    if (!currentUser || !activeWorkspaceId) {
      return false;
    }

    setApproveLoadingId(requestId);
    setInviteError(null);

    try {
      const response = await fetch(`/api/workspaces/${activeWorkspaceId}/join-requests/${requestId}/approve`, {
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
    updateSettings,
    saveSettings,
    createInvite,
    approveJoinRequest,
    refreshWorkspaceAdmin,
  };
}
