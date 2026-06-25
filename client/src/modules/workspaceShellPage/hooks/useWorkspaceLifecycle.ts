import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { User, Project } from '../../../types/domain';
import type { WorkspaceSummary } from '../../../hooks/useWorkspaceDirectory';
import type { AppSection } from '../types/AppShell';
import {
  workspaceDirectoryService as defaultWorkspaceDirectoryService,
  type WorkspaceDirectoryService,
} from '../../../services/workspaceDirectoryService';
import { useWorkspaceSelectionState } from './useWorkspaceSelectionState';
import { normalizeInviteCode } from '../../../utils/workspace';

const WORKSPACE_INVITE_TTL_MS = 5 * 60 * 1000;

type PendingWorkspaceInviteState = {
  code: string;
  expiresAt: number;
};

let pendingWorkspaceInviteState: PendingWorkspaceInviteState | null = null;

function storePendingWorkspaceInvite(rawInviteCode: string) {
  const code = normalizeInviteCode(rawInviteCode);
  if (!code) {
    return;
  }

  pendingWorkspaceInviteState = {
    code,
    expiresAt: Date.now() + WORKSPACE_INVITE_TTL_MS,
  };
}

function consumePendingWorkspaceInvite(): string | null {
  if (!pendingWorkspaceInviteState) {
    return null;
  }

  if (pendingWorkspaceInviteState.expiresAt <= Date.now()) {
    pendingWorkspaceInviteState = null;
    return null;
  }

  return pendingWorkspaceInviteState.code;
}

function clearPendingWorkspaceInvite() {
  pendingWorkspaceInviteState = null;
}

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
  useWorkspaceSelectionState({
    currentUser,
    workspaces,
    workspacesLoading,
    workspacesResolvedForCurrentUser,
    activeWorkspaceId,
    setActiveWorkspaceId,
    setWorkspaceReady,
    onUserSignOut: () => {
      setActiveSection('workspace');
    },
    onNoWorkspaces: () => {
      setActiveSection((current) => (current === 'account' ? current : 'directory'));
    },
  });
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
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const invite = urlParams.get('invite');
    if (!invite) {
      return;
    }

    storePendingWorkspaceInvite(invite);
    const newUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUser) return;

    const pendingInvite = consumePendingWorkspaceInvite();
    if (!pendingInvite) {
      clearPendingWorkspaceInvite();
      return;
    }

    const runAutoJoin = async () => {
    try {
      const success = await requestJoinByInvite(pendingInvite);
      if (success) {
        await refreshWorkspaces();
      }
    } finally {
      clearPendingWorkspaceInvite();
    }
    };
    void runAutoJoin();
  }, [currentUser, requestJoinByInvite, refreshWorkspaces]);
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
  const activeWorkspaceProjectById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const project of activeWorkspaceProjects) {
      map.set(project.id, project);
    }
    return map;
  }, [activeWorkspaceProjects]);
  const activeWorkspaceProjectIdSet = useMemo(
    () => new Set(activeWorkspaceProjects.map((project) => project.id)),
    [activeWorkspaceProjects]
  );

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

    if (!activeWorkspaceProjectIdSet.has(activeProjectId)) {
      const preferredProject = activeWorkspaceDefaultProjectId
        ? activeWorkspaceProjectById.get(activeWorkspaceDefaultProjectId)
        : null;
      const nextProject = preferredProject ?? activeWorkspaceProjects[0] ?? null;

      if (nextProject) {
        setActiveProjectId(nextProject.id);
      }

      return;
    }
  }, [
    activeProjectId,
    activeWorkspaceDefaultProjectId,
    activeWorkspaceId,
    activeWorkspaceProjectById,
    setActiveProjectId,
    activeWorkspaceProjectIdSet,
  ]);
}
