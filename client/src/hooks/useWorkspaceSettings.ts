import { toast } from '@library';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, CACHE_CONFIGS } from '../utils/queryClient';
import { ApiError, apiClient } from '../utils/apiClient';
import type { User } from '../context/TicketContextContext';
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

function resolveDownloadFilename(contentDisposition: string | null, workspaceId: string) {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] || `gravity-${workspaceId}-tasks-export.json`;
}

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
  const queryClient = useQueryClient();
  const savingRef = useRef(false);
  const draftRevision = useRef(0);
  const submittedRevision = useRef(0);
  const baselineSettings = useRef<WorkspaceAdminSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<WorkspaceAdminSettings | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveErrorState, setSaveError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const enabled = !!currentUser && !!activeWorkspaceId;
  const userId = currentUser?.id;

  const buildHeaders = useCallback(() => {
    const headers: Record<string, string> = {};

    if (userId) {
      headers['X-User-Id'] = userId;
    }

    return headers;
  }, [userId]);

  // --- Queries ---

  // Workspace Settings Query
  const settingsQuery = useQuery({
    queryKey: queryKeys.workspaceSettings(activeWorkspaceId),
    queryFn: async () => {
      const data = await apiClient.get<{
        workspaceId?: string;
        key?: string;
        hostUrl?: string;
        joinMode?: WorkspaceJoinMode;
        hierarchyMode?: 'flat' | 'teams';
        workspaceKey?: string;
        disabledMcpTools?: string[];
      }>(`/workspaces/${activeWorkspaceId}/settings`, {
        headers: buildHeaders(),
      });
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
    staleTime: CACHE_CONFIGS.workspaceSettings.staleTime,
    gcTime: CACHE_CONFIGS.workspaceSettings.gcTime,
    enabled,
  });

  // Sync draft settings with query data
  useEffect(() => {
    const previousBaseline = baselineSettings.current;
    const nextBaseline = settingsQuery.data ?? null;
    baselineSettings.current = nextBaseline;
    setDraftSettings(current => {
      const hasLocalEdits = current?.workspaceId === activeWorkspaceId &&
        JSON.stringify(current) !== JSON.stringify(previousBaseline);
      return nextBaseline && hasLocalEdits ? current : nextBaseline;
    });
  }, [settingsQuery.data, activeWorkspaceId]);

  // Workspace Members Query
  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(activeWorkspaceId),
    queryFn: async () => {
      const data = await apiClient.get<unknown>(`/workspaces/${activeWorkspaceId}/members`, {
        headers: buildHeaders(),
      });
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
      const data = await apiClient.get<unknown[]>(`/workspaces/${activeWorkspaceId}/invites`, {
        headers: buildHeaders(),
      });
      return (Array.isArray(data) ? data.map((invite) => normalizeWorkspaceInvite(invite as Record<string, unknown>)) : []) as WorkspaceInvite[];
    },
    staleTime: CACHE_CONFIGS.workspaceInvites.staleTime,
    gcTime: CACHE_CONFIGS.workspaceInvites.gcTime,
    enabled,
  });

  // Workspace Join Requests Query
  const joinRequestsQuery = useQuery({
    queryKey: queryKeys.workspaceJoinRequests(activeWorkspaceId),
    queryFn: async () => {
      try {
        const data = await apiClient.get<unknown[]>(`/workspaces/${activeWorkspaceId}/join-requests`, {
          headers: buildHeaders(),
        });
        return (Array.isArray(data) ? data : []) as WorkspaceJoinRequest[];
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          return [] as WorkspaceJoinRequest[];
        }
        throw error;
      }
    },
    staleTime: CACHE_CONFIGS.workspaceJoinRequests.staleTime,
    gcTime: CACHE_CONFIGS.workspaceJoinRequests.gcTime,
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
      const data = await apiClient.patch<{
        workspaceId?: string;
        key?: string;
        hostUrl?: string;
        joinMode?: WorkspaceJoinMode;
        hierarchyMode?: 'flat' | 'teams';
        workspaceKey?: string;
        disabledMcpTools?: string[];
      }>(`/workspaces/${activeWorkspaceId}/settings`, {
        hostUrl: payload.hostUrl,
        joinMode: payload.joinMode,
        workspaceKey: payload.workspaceKey,
        disabledMcpTools: payload.disabledMcpTools || [],
      }, {
        headers: buildHeaders(),
      });
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
    onSuccess: (data, submitted) => {
      baselineSettings.current = data;
      setDraftSettings(current => JSON.stringify(current) === JSON.stringify(submitted) ? data : current);
      queryClient.setQueryData(queryKeys.workspaceSettings(activeWorkspaceId), data);
      setSaveSuccess(draftRevision.current === submittedRevision.current);
      toast.show('Workspace settings saved.', 'success');
      setSaveError(null);
    },
    onError: (err: Error) => {
      setSaveError(err.message || 'Failed to save workspace settings.');
      toast.show(`Failed to save workspace settings: ${err.message} Please try again.`, 'error');
    },
  });

  // Create Invite Mutation
  const createInviteMutation = useMutation({
    mutationFn: async (input: CreateWorkspaceInviteInput) => {
      const data = await apiClient.post<Record<string, unknown>>(`/workspaces/${activeWorkspaceId}/invites`, {
        createdBy: currentUser?.id,
        label: input.label,
      }, {
        headers: {
          ...buildHeaders(),
        },
      });
      return normalizeWorkspaceInvite(data as Record<string, unknown>);
    },
    onSuccess: async () => {
      toast.show('Invite created.', 'success');
      await refreshWorkspaceAdmin();
      setInviteError(null);
    },
    onError: (err: Error) => {
      setInviteError(err.message || 'Failed to create invite.');
      toast.show(`Failed to create invite: ${err.message} Please try again.`, 'error');
    },
  });

  // Revoke Invite Mutation
  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiClient.post<{ success: boolean }>(`/workspaces/${activeWorkspaceId}/invites/${inviteId}/revoke`, {}, {
        headers: {
          ...buildHeaders(),
        },
      });
    },
    onSuccess: async () => {
      toast.show('Invite revoked.', 'success');
      await refreshWorkspaceAdmin();
      setInviteError(null);
    },
    onError: (err: Error) => {
      setInviteError(err.message || 'Failed to revoke invite.');
      toast.show(`Failed to revoke invite: ${err.message} Please try again.`, 'error');
    },
  });

  // Approve Join Request Mutation
  const approveJoinRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await apiClient.post<{ success: boolean }>(`/workspaces/${activeWorkspaceId}/join-requests/${requestId}/approve`, undefined, {
        headers: {
          ...buildHeaders(),
        },
      });
    },
    onSuccess: async () => {
      toast.show('Join request approved.', 'success');
      await refreshWorkspaceAdmin();
      setInviteError(null);
    },
    onError: (err: Error) => {
      setInviteError(err.message || 'Failed to approve join request.');
      toast.show(`Failed to approve join request: ${err.message} Please try again.`, 'error');
    },
  });

  // Delete Workspace Mutation
  const deleteWorkspaceMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete<{ success: boolean }>(`/workspaces/${activeWorkspaceId}`, {
        headers: {
          ...buildHeaders(),
        },
      });
    },
    onError: (err: Error) => {
      setDeleteError(err.message || 'Failed to delete workspace.');
      toast.show(`Failed to delete workspace: ${err.message} Please try again.`, 'error');
    },
  });

  // Export Tasks Mutation
  const exportTasksMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.raw(`/workspaces/${activeWorkspaceId}/export/tasks`, {
        headers: buildHeaders(),
      });

      if (!response.ok) {
        let data: { error?: string; message?: string } | null = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        const message = data?.error || data?.message || response.statusText || 'Failed to export tasks.';
        throw new ApiError(response.status, message, data);
      }

      const blob = await response.blob();
      const filename = resolveDownloadFilename(response.headers.get('Content-Disposition'), activeWorkspaceId);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => { toast.show('Task export downloaded.', 'success'); },
    onMutate: () => {
      setExportError(null);
    },
    onError: (err: Error) => {
      setExportError(err.message || 'Failed to export tasks.');
      toast.show(`Failed to export tasks: ${err.message} Please try again.`, 'error');
    },
  });

  // --- Exposed Callbacks ---

  const updateSettings = useCallback((updates: Partial<WorkspaceAdminSettings>) => {
    draftRevision.current++;
    setDraftSettings((current) => (current ? { ...current, ...updates } : { ...defaultSettings(activeWorkspaceId), ...updates }));
    setSaveSuccess(false);
    setSaveError(null);
  }, [activeWorkspaceId]);

  const saveSettings = useCallback(async () => {
    if (!draftSettings || savingRef.current) return;
    savingRef.current = true;
    submittedRevision.current = draftRevision.current;
    try {
      await saveSettingsMutation.mutateAsync(draftSettings);
    } catch {
      // Mutation owns error feedback; event handlers must not leak rejections.
    } finally {
      savingRef.current = false;
    }
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

  const exportTasks = useCallback(async () => {
    try {
      await exportTasksMutation.mutateAsync();
      return true;
    } catch {
      return false;
    }
  }, [exportTasksMutation]);

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
    hasChanges: Boolean(draftSettings && settingsQuery.data && JSON.stringify(draftSettings) !== JSON.stringify(settingsQuery.data)),
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
    exportLoading: exportTasksMutation.isPending,
    exportError,
    deleteLoading: deleteWorkspaceMutation.isPending,
    deleteError,
    updateSettings,
    saveSettings,
    createInvite,
    revokeInvite,
    approveJoinRequest,
    refreshWorkspaceAdmin,
    exportTasks,
    deleteWorkspace,
    clearDeleteError,
    updateMemberActivity,
  };
}
