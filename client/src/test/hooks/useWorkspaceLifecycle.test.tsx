import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import type { User } from '../../types/domain';
import { usePendingWorkspaceInvite, useWorkspaceProjectSelection } from '../../modules/workspaceShellPage/hooks/useWorkspaceLifecycle';

describe('usePendingWorkspaceInvite', () => {
  it('removes only the consumed invite without discarding router history state', async () => {
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const routerState = { idx: 3, usr: { source: 'ticket' } };
    window.history.replaceState(routerState, '', '/workspaces/ws-1/projects/p-1/tickets/T-1?invite=code&status=todo#comments');
    try {
      renderHook(() => usePendingWorkspaceInvite({
        currentUser: null,
        requestJoinByInvite: vi.fn(),
        refreshWorkspaces: vi.fn(),
      }));
      await waitFor(() => expect(window.location.pathname + window.location.search + window.location.hash)
        .toBe('/workspaces/ws-1/projects/p-1/tickets/T-1?status=todo#comments'));
      expect(window.history.state).toEqual(routerState);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('takes a fragment invite out of the URL before authentication', async () => {
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState({ idx: 4 }, '', '/?status=todo#invite=WSP-SECRET');
    try {
      renderHook(() => usePendingWorkspaceInvite({
        currentUser: null,
        requestJoinByInvite: vi.fn(),
        refreshWorkspaces: vi.fn(),
      }));
      await waitFor(() => expect(window.location.pathname + window.location.search + window.location.hash).toBe('/?status=todo'));
      expect(window.history.state).toEqual({ idx: 4 });
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('submits a captured invite only once when effects run twice', async () => {
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const requestJoinByInvite = vi.fn().mockResolvedValue(true);
    window.history.replaceState(null, '', '/#invite=WSP-ONEUSE');
    try {
      renderHook(() => usePendingWorkspaceInvite({
        currentUser: { id: 'user-1' } as User,
        requestJoinByInvite,
        refreshWorkspaces: vi.fn().mockResolvedValue([]),
      }), { wrapper: StrictMode });
      await waitFor(() => expect(requestJoinByInvite).toHaveBeenCalledTimes(1));
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('retains a captured invite through sign-in and submits it once', async () => {
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const requestJoinByInvite = vi.fn().mockResolvedValue(true);
    const refreshWorkspaces = vi.fn().mockResolvedValue([]);
    window.history.replaceState(null, '', '/#invite=WSP-AFTERLOGIN');
    try {
      const { rerender } = renderHook(({ currentUser }: { currentUser: User | null }) => usePendingWorkspaceInvite({
        currentUser,
        requestJoinByInvite,
        refreshWorkspaces,
      }), { initialProps: { currentUser: null as User | null }, wrapper: StrictMode });
      expect(window.location.hash).toBe('');
      expect(requestJoinByInvite).not.toHaveBeenCalled();

      rerender({ currentUser: { id: 'signed-in-user' } as User });
      await waitFor(() => expect(requestJoinByInvite).toHaveBeenCalledTimes(1));
      expect(requestJoinByInvite).toHaveBeenCalledWith('WSP-AFTERLOGIN');
      await waitFor(() => expect(refreshWorkspaces).toHaveBeenCalledTimes(1));
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });
});

describe('useWorkspaceProjectSelection', () => {
  it('falls back to the workspace default project when the active project is not in workspace', async () => {
    const setActiveProjectId = vi.fn();

    renderHook(() =>
      useWorkspaceProjectSelection({
        activeWorkspaceId: 'workspace-1',
        activeWorkspaceDefaultProjectId: 'project-2',
        activeWorkspaceProjects: [
          { id: 'project-1', name: 'Project One', description: '', key: 'P1', status: 'active', workspaceId: 'workspace-1' },
          { id: 'project-2', name: 'Project Two', description: '', key: 'P2', status: 'active', workspaceId: 'workspace-1' },
        ],
        activeProjectId: 'missing',
        setActiveProjectId,
      }),
    );

    await waitFor(() => {
      expect(setActiveProjectId).toHaveBeenCalledWith('project-2');
    });
  });

  it('falls back to the first workspace project when no default project exists', async () => {
    const setActiveProjectId = vi.fn();

    renderHook(() =>
      useWorkspaceProjectSelection({
        activeWorkspaceId: 'workspace-1',
        activeWorkspaceDefaultProjectId: null,
        activeWorkspaceProjects: [
          { id: 'project-1', name: 'Project One', description: '', key: 'P1', status: 'active', workspaceId: 'workspace-1' },
          { id: 'project-2', name: 'Project Two', description: '', key: 'P2', status: 'active', workspaceId: 'workspace-1' },
        ],
        activeProjectId: 'missing',
        setActiveProjectId,
      }),
    );

    await waitFor(() => {
      expect(setActiveProjectId).toHaveBeenCalledWith('project-1');
    });
  });

  it('keeps the active project when it is still part of the workspace', async () => {
    const setActiveProjectId = vi.fn();

    renderHook(() =>
      useWorkspaceProjectSelection({
        activeWorkspaceId: 'workspace-1',
        activeWorkspaceDefaultProjectId: null,
        activeWorkspaceProjects: [
          { id: 'project-1', name: 'Project One', description: '', key: 'P1', status: 'active', workspaceId: 'workspace-1' },
        ],
        activeProjectId: 'project-1',
        setActiveProjectId,
      }),
    );

    await waitFor(() => {
      expect(setActiveProjectId).not.toHaveBeenCalled();
    });
  });
});
