import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceManagementCommands } from '../../modules/workspaces/hooks/useWorkspaceManagementCommands';

describe('useWorkspaceManagementCommands', () => {
  const activeWorkspaceId = 'workspace-1';
  const activeProjectId = 'project-1';
  const createProject = vi.fn();
  const refreshWorkspaces = vi.fn();
  const updateLabel = vi.fn();
  const deleteLabel = vi.fn();
  const setActiveTicket = vi.fn();
  const setProjectCreateLoading = vi.fn();
  const setProjectCreateError = vi.fn();
  const setLabelCreateLoading = vi.fn();
  const setLabelCreateError = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards an explicit projectId when creating a label from project management', async () => {
    const createLabel = vi.fn().mockResolvedValue({ id: 'label-1' });
    const { result } = renderHook(() =>
      useWorkspaceManagementCommands({
        activeWorkspaceId,
        currentUser: { id: 'user-1' },
        activeProjectId,
        createProject,
        refreshWorkspaces,
        createLabel,
        updateLabel,
        deleteLabel,
        setActiveTicket,
        setProjectCreateLoading,
        setProjectCreateError,
        setLabelCreateLoading,
        setLabelCreateError,
        navigate,
      }),
    );

    await act(async () => {
      await result.current.handleCreateLabel({
        name: 'Payments',
        color: '#ff0000',
        description: 'Billing workflows',
        projectId: 'project-2',
      });
    });

    expect(createLabel).toHaveBeenCalledWith({
      name: 'Payments',
      color: '#ff0000',
      description: 'Billing workflows',
      projectId: 'project-2',
    });
    expect(setLabelCreateError).toHaveBeenCalledWith(null, 'project-2');
  });

  it('falls back to the active project when no projectId is supplied', async () => {
    const createLabel = vi.fn().mockResolvedValue({ id: 'label-1' });
    const { result } = renderHook(() =>
      useWorkspaceManagementCommands({
        activeWorkspaceId,
        currentUser: { id: 'user-1' },
        activeProjectId,
        createProject,
        refreshWorkspaces,
        createLabel,
        updateLabel,
        deleteLabel,
        setActiveTicket,
        setProjectCreateLoading,
        setProjectCreateError,
        setLabelCreateLoading,
        setLabelCreateError,
        navigate,
      }),
    );

    await act(async () => {
      await result.current.handleCreateLabel({
        name: 'Platform',
        color: '#3b82f6',
        description: 'Shared platform work',
      });
    });

    expect(createLabel).toHaveBeenCalledWith({
      name: 'Platform',
      color: '#3b82f6',
      description: 'Shared platform work',
      projectId: 'project-1',
    });
    expect(setLabelCreateError).toHaveBeenCalledWith(null, 'project-1');
  });
});
