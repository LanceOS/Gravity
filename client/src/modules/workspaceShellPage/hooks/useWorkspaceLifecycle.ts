import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { User, Project } from '../../../types/domain';
import type { WorkspaceSummary } from '../../../hooks/useWorkspaceDirectory';
import type { AppSection } from '../types/AppShell';
import { getActiveWorkspaceStorageKey } from '../../../modules/workspaces';
import { useLocalStorageString } from '../../../hooks/useLocalStorageString';

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
  const { readValue, writeValue } = useLocalStorageString({
    key: currentUser ? getActiveWorkspaceStorageKey(currentUser.id) : null,
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
  const { readValue: readPendingInvite, writeValue: writePendingInvite } = useLocalStorageString({
    key: 'gravity_pending_invite',
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
}

export function useWorkspaceMemberActivity({
  activeWorkspaceId,
  currentUser,
  updateMemberActivity,
}: UseWorkspaceMemberActivityArgs) {
  useEffect(() => {
    if (!activeWorkspaceId || !currentUser) {
      return;
    }

    fetch(`/api/v1/workspaces/${activeWorkspaceId}/members/${currentUser.id}/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': currentUser.id,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.lastActiveAt) {
          updateMemberActivity(currentUser.id, data.lastActiveAt);
        }
      })
      .catch((err) => {
        console.error('Failed to log workspace activity:', err);
      });
  }, [activeWorkspaceId, currentUser, updateMemberActivity]);
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
