import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { User, Project } from '../../../types/domain';
import type { WorkspaceSummary } from '../../../hooks/useWorkspaceDirectory';
import type { AppSection } from '../types/AppShell';
import { useQueryCacheString } from '../../../hooks/useQueryCacheString';
import {
  workspaceDirectoryService as defaultWorkspaceDirectoryService,
  type WorkspaceDirectoryService,
} from '../../../services/workspaceDirectoryService';

interface UseActiveWorkspaceSelectionArgs {
  currentUser: User | null;
  workspacesResolvedForCurrentUser: boolean;
  workspacesLoading: boolean;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  setActiveWorkspaceId: Dispatch<SetStateAction<string>>;
  setWorkspaceReady: Dispatch<SetStateAction<boolean>>;
  setActiveSection: Dispatch<SetStateAction<AppSection>>;
}

export function useActiveWorkspaceSelection({
  currentUser,
  workspacesResolvedForCurrentUser,
  workspacesLoading,
  workspaces,
  activeWorkspaceId,
  setActiveWorkspaceId,
  setWorkspaceReady,
  setActiveSection,
}: UseActiveWorkspaceSelectionArgs) {
  const cachedWorkspaceIdKey = useMemo(
    () =>
      currentUser ? (['workspaceShell', 'activeWorkspaceId', { userId: currentUser.id }] as const) : null,
    [currentUser?.id]
  );
  const { readValue, writeValue } = useQueryCacheString({
    key: cachedWorkspaceIdKey,
  });

  useEffect(() => {
    if (!currentUser) {
      setActiveSection('workspace');
      setActiveWorkspaceId('');
      setWorkspaceReady(false);
      return;
    }

    if (!workspacesResolvedForCurrentUser || workspacesLoading) {
      return;
    }

    if (workspaces.length === 0) {
      setActiveWorkspaceId('');
      setWorkspaceReady(true);
      setActiveSection((current) => (current === 'account' ? current : 'directory'));
      return;
    }

    if (!activeWorkspaceId || !workspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
      const storedWorkspaceId =
        readValue();
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
    setActiveSection,
    setActiveWorkspaceId,
    setWorkspaceReady,
    readValue,
    workspaces,
    workspacesLoading,
    workspacesResolvedForCurrentUser,
  ]);

  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') {
      return;
    }

    writeValue(activeWorkspaceId || null);
  }, [currentUser, activeWorkspaceId, writeValue]);
}

interface UsePendingWorkspaceInviteArgs {
  currentUser: User | null;
  requestJoinByInvite: (inviteCode: string, message?: string) => Promise<boolean>;
  refreshWorkspaces: () => Promise<WorkspaceSummary[]>;
}

export function usePendingWorkspaceInvite({
  currentUser,
  requestJoinByInvite,
  refreshWorkspaces,
}: UsePendingWorkspaceInviteArgs) {
  const { readValue: readPendingInvite, writeValue: writePendingInvite } = useQueryCacheString({
    key: ['workspaceShell', 'pendingInvite'],
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const invite = urlParams.get('invite');
    if (!invite) {
      return;
    }

    writePendingInvite(invite);
    const newUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
  }, [writePendingInvite]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUser) return;

    const pendingInvite = readPendingInvite();
    if (!pendingInvite) {
      return;
    }

    writePendingInvite(null);

    const runAutoJoin = async () => {
      const success = await requestJoinByInvite(pendingInvite);
      if (success) {
        await refreshWorkspaces();
      }
    };
    void runAutoJoin();
  }, [currentUser, readPendingInvite, requestJoinByInvite, refreshWorkspaces, writePendingInvite]);
}

interface UseWorkspaceMemberActivityArgs {
  activeWorkspaceId: string;
  currentUser: User | null;
  updateMemberActivity: (userId: string, lastActiveAt: string) => void;
  workspaceDirectoryService?: WorkspaceDirectoryService;
}

export function useWorkspaceMemberActivity({
  activeWorkspaceId,
  currentUser,
  updateMemberActivity,
  workspaceDirectoryService = defaultWorkspaceDirectoryService,
}: UseWorkspaceMemberActivityArgs) {
  useEffect(() => {
    if (!activeWorkspaceId || !currentUser) {
      return;
    }

    void workspaceDirectoryService
      .logWorkspaceMemberActivity(activeWorkspaceId, currentUser.id)
      .then((lastActiveAt) => {
        if (lastActiveAt) {
          updateMemberActivity(currentUser.id, lastActiveAt);
        }
      })
      .catch((err) => {
        console.error('Failed to log workspace activity:', err);
      });
  }, [activeWorkspaceId, currentUser, updateMemberActivity, workspaceDirectoryService]);
}

interface UseWorkspaceProjectSelectionArgs {
  activeWorkspaceId: string;
  activeWorkspaceDefaultProjectId?: string | null;
  activeWorkspaceProjects: Project[];
  activeProjectId: string;
  setActiveProjectId: (projectId: string) => void;
}

export function useWorkspaceProjectSelection({
  activeWorkspaceId,
  activeWorkspaceDefaultProjectId,
  activeWorkspaceProjects,
  activeProjectId,
  setActiveProjectId,
}: UseWorkspaceProjectSelectionArgs) {
  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }

    if (activeWorkspaceProjects.length === 0) {
      if (activeProjectId) {
        setActiveProjectId('');
      }
      return;
    }

    if (!activeWorkspaceProjects.some((project) => project.id === activeProjectId)) {
      const preferredProject = activeWorkspaceProjects.find((project) => project.id === activeWorkspaceDefaultProjectId) || activeWorkspaceProjects[0];
      if (preferredProject) {
        setActiveProjectId(preferredProject.id);
      }
    }
  }, [
    activeProjectId,
    activeWorkspaceDefaultProjectId,
    activeWorkspaceId,
    activeWorkspaceProjects,
    setActiveProjectId,
  ]);
}
