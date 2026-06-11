import { useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, queryKeys, CACHE_CONFIGS } from '../utils/queryClient';
import type { User } from '../context/TicketContext';
import type { WorkspaceJoinMode } from './useWorkspaceDirectory';

export interface WorkspaceAdminSettings {
  workspaceId: string;
  key: string;
  hostUrl: string;
  joinMode: WorkspaceJoinMode;
  hierarchyMode: 'flat' | 'teams';
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
  hierarchyMode: 'flat',
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
    maxUses: invite.maxUses === null || invite.maxUses === undefined ? null : Number(invite.maxUses),
    useCount: Number(invite.useCount ?? 0),
    createdAt: String(invite.createdAt ?? ''),
    createdByName: String(invite.createdByName ?? ''),
    pendingJoinRequestCount: Number(invite.pendingJoinRequestCount ?? 0),
  };
}

export function useWorkspaceSettings({ currentUser, activeWorkspaceId }: UseWorkspaceSettingsOptions) {
  const [draftSettings, setDraftSettings] = useState<WorkspaceAdminSettings | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveErrorState, setSaveError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const enabled = !!currentUser && !!activeWorkspaceId;

  // --- Queries ---

  // Workspace Settings Query
  const settingsQuery = useQuery({
    queryKey: queryKeys.workspaceSettings(activeWorkspaceId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/settings`, {
        headers: { 'X-User-Id': currentUser!.id },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load workspace settings.');
      return {
        workspaceId: data.workspaceId || activeWorkspaceId,
        key: data.key || '',
        hostUrl: data.hostUrl || '',
        joinMode: data.joinMode === 'auto_join' ? 'auto_join' : 'approval_required',
        hierarchyMode: data.hierarchyMode === 'teams' ? 'teams' : 'flat',
        workspaceKey: data.workspaceKey || '',
        disabledMcpTools: Array.isArray(data.disabledMcpTools) ? data.disabledMcpTools : [],
      } as WorkspaceAdminSettings;
    },
    enabled,
  });

  // Sync draft settings with query data
  useEffect(() => {
    if (settingsQuery.data) {
      setDraftSettings(settingsQuery.data);
    } else {
      setDraftSettings(null);
    }
  }, [settingsQuery.data, activeWorkspaceId]);

  // Workspace Members Query
  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(activeWorkspaceId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/members`, {
        headers: { 'X-User-Id': currentUser!.id },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load workspace members.');
      return (Array.isArray(data) ? data : []) as WorkspaceMember[];
    },
    enabled,
    staleTime: CACHE_CONFIGS.workspaceMembers.staleTime,
    gcTime: CACHE_CONFIGS.workspaceMembers.gcTime,
  });

  // Workspace Invites Query
  const invitesQuery = useQuery({
    queryKey: queryKeys.workspaceInvites(activeWorkspaceId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/invites`, {
        headers: { 'X-User-Id': currentUser!.id },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load workspace invites.');
      return (Array.isArray(data) ? data.map((invite) => normalizeWorkspaceInvite(invite as Record<string, unknown>)) : []) as WorkspaceInvite[];
    },
    enabled,
  });

  // Workspace Join Requests Query
  const joinRequestsQuery = useQuery({
    queryKey: queryKeys.workspaceJoinRequests(activeWorkspaceId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/join-requests`, {
        headers: { 'X-User-Id': currentUser!.id },
      });
      const data = await res.json();
      if (res.status === 403) return [] as WorkspaceJoinRequest[];
      if (!res.ok) throw new Error(data.error || 'Failed to load workspace join requests.');
      return (Array.isArray(data) ? data : []) as WorkspaceJoinRequest[];
    },
    enabled,
  });

  // Combine query loading states
  const settingsLoading =
    settingsQuery.isLoading ||
    membersQuery.isLoading ||
    invitesQuery.isLoading ||
    joinRequestsQuery.isLoading;

  const refreshWorkspaceAdmin = useCallback(async () => {
    await Promise.all([
      settingsQuery.refetch(),
      membersQuery.refetch(),
      invitesQuery.refetch(),
      joinRequestsQuery.refetch(),
    ]);
  }, [settingsQuery, membersQuery, invitesQuery, joinRequestsQuery]);

  // --- Success timer helper ---
  useEffect(() => {
    if (!saveSuccess) return undefined;
    const timer = window.setTimeout(() => setSaveSuccess(false), 2500);
    return () => window.clearTimeout(timer);
  }, [saveSuccess]);

  // --- Mutations ---

  // Save Settings Mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: Partial<WorkspaceAdminSettings>) => {
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser!.id,
        },
        body: JSON.stringify({
          hostUrl: payload.hostUrl,
          joinMode: payload.joinMode,
          workspaceKey: payload.workspaceKey,
          disabledMcpTools: payload.disabledMcpTools || [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save workspace settings.');
      return {
        workspaceId: data.workspaceId || activeWorkspaceId,
        key: data.key || payload.key,
        hostUrl: data.hostUrl || '',
        joinMode: data.joinMode === 'auto_join' ? 'auto_join' : 'approval_required',
        hierarchyMode: data.hierarchyMode === 'teams' ? 'teams' : 'flat',
        workspaceKey: data.workspaceKey || payload.workspaceKey,
        disabledMcpTools: Array.isArray(data.disabledMcpTools) ? data.disabledMcpTools : payload.disabledMcpTools || [],
      } as WorkspaceAdminSettings;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.workspaceSettings(activeWorkspaceId), data);
      setSaveSuccess(true);
      setSaveError(null);
    },
    onError: (err: Error) => {
      setSaveError(err.message || 'Failed to save workspace settings.');
    },
  });

  // Create Invite Mutation
  const createInviteMutation = useMutation({
    mutationFn: async (input: CreateWorkspaceInviteInput) => {
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser!.id,
        },
        body: JSON.stringify({
          createdBy: currentUser!.id,
          label: input.label,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create invite.');
      return normalizeWorkspaceInvite(data as Record<string, unknown>);
    },
    onSuccess: async () => {
      await refreshWorkspaceAdmin();
      setInviteError(null);
    },
    onError: (err: Error) => {
      setInviteError(err.message || 'Failed to create invite.');
    },
  });

  // Revoke Invite Mutation
  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/invites/${inviteId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser!.id,
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to revoke invite.');
    },
    onSuccess: async () => {
      await refreshWorkspaceAdmin();
      setInviteError(null);
    },
    onError: (err: Error) => {
      setInviteError(err.message || 'Failed to revoke invite.');
    },
  });

  // Approve Join Request Mutation
  const approveJoinRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/join-requests/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser!.id,
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to approve join request.');
    },
    onSuccess: async () => {
      await refreshWorkspaceAdmin();
      setInviteError(null);
    },
    onError: (err: Error) => {
      setInviteError(err.message || 'Failed to approve join request.');
    },
  });

  // Delete Workspace Mutation
  const deleteWorkspaceMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser!.id,
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete workspace.');
    },
    onError: (err: Error) => {
      setDeleteError(err.message || 'Failed to delete workspace.');
    },
  });

  // --- Exposed Callbacks ---

  const updateSettings = useCallback((updates: Partial<WorkspaceAdminSettings>) => {
    setDraftSettings((current) => (current ? { ...current, ...updates } : { ...defaultSettings(activeWorkspaceId), ...updates }));
    setSaveSuccess(false);
    setSaveError(null);
  }, [activeWorkspaceId]);

  const saveSettings = useCallback(async () => {
    if (!draftSettings) return;
    await saveSettingsMutation.mutateAsync(draftSettings);
  }, [draftSettings, saveSettingsMutation]);

  const createInvite = useCallback(async (input: CreateWorkspaceInviteInput) => {
    try {
      return await createInviteMutation.mutateAsync(input);
    } catch {
      return null;
    }
  }, [createInviteMutation]);

  const revokeInvite = useCallback(async (inviteId: string) => {
    try {
      await revokeInviteMutation.mutateAsync(inviteId);
      return true;
    } catch {
      return false;
    }
  }, [revokeInviteMutation]);

  const approveJoinRequest = useCallback(async (requestId: string) => {
    try {
      await approveJoinRequestMutation.mutateAsync(requestId);
      return true;
    } catch {
      return false;
    }
  }, [approveJoinRequestMutation]);

  const deleteWorkspace = useCallback(async () => {
    try {
      await deleteWorkspaceMutation.mutateAsync();
      return true;
    } catch {
      return false;
    }
  }, [deleteWorkspaceMutation]);

  const clearDeleteError = useCallback(() => setDeleteError(null), []);

  const updateMemberActivity = useCallback((userId: string, lastActiveAt: string) => {
    queryClient.setQueryData<WorkspaceMember[]>(queryKeys.workspaceMembers(activeWorkspaceId), (old) =>
      old ? old.map((m) => (m.id === userId ? { ...m, lastActiveAt } : m)) : []
    );
  }, [activeWorkspaceId]);

  const saveError = settingsQuery.error?.message || saveSettingsMutation.error?.message || saveErrorState || null;

  return {
    settings: draftSettings || defaultSettings(activeWorkspaceId),
    settingsLoading,
    saveLoading: saveSettingsMutation.isPending,
    saveSuccess,
    saveError,
    members: membersQuery.data || [],
    invites: invitesQuery.data || [],
    invitesLoading: invitesQuery.isLoading,
    joinRequests: joinRequestsQuery.data || [],
    inviteLoading: createInviteMutation.isPending,
    inviteError,
    approveLoadingId: approveJoinRequestMutation.isPending ? approveJoinRequestMutation.variables : null,
    revokeLoadingId: revokeInviteMutation.isPending ? revokeInviteMutation.variables : null,
    deleteLoading: deleteWorkspaceMutation.isPending,
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
