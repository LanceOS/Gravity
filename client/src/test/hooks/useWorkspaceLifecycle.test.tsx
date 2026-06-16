import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceProjectSelection } from '../../modules/workspaceShellPage/hooks/useWorkspaceLifecycle';

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
