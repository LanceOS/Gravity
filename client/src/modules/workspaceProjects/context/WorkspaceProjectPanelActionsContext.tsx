import { createContext, useCallback, useContext, type FormEvent, type PropsWithChildren } from 'react';

import type { Label } from '../../../context/TicketContext';
import { createProjectSettingsFeedback, DEFAULT_LABEL_COLOR, sanitizeProjectKey, validateGithubRepoUrl } from '../utils/WorkspaceProjectPanel';
import type { WorkspaceProjectPanelProps } from '../types/WorkspaceProjectPanel';
import { useWorkspaceProjectPanelLabelStateContext } from './WorkspaceProjectPanelLabelStateContextCore';
import { useWorkspaceProjectPanelProjectStateContext } from './WorkspaceProjectPanelProjectStateContext';

type WorkspaceProjectPanelActionCallbacks = Pick<
  WorkspaceProjectPanelProps,
  'onSelectProject' | 'onCreateProject' | 'onUpdateProject' | 'onCreateLabel' | 'onUpdateLabel' | 'onDeleteLabel'
>;

export interface WorkspaceProjectPanelActionsContextValue {
  isCreateProjectModalOpen: boolean;
  openCreateProjectModal: () => void;
  closeCreateProjectModal: () => void;
  createProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  selectProject: (projectId: string) => void;
  createLabel: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  startEditingLabel: (label: Label) => void;
  updateLabel: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  deleteLabel: () => Promise<void>;
  saveProjectSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

const WorkspaceProjectPanelActionsContext = createContext<WorkspaceProjectPanelActionsContextValue | null>(null);

export function WorkspaceProjectPanelActionsContextProvider({
  children,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
}: PropsWithChildren<WorkspaceProjectPanelActionCallbacks>): JSX.Element {
  const {
    setManagedProjectId,
    managedProject,
    setIsProjectSettingsSaving,
    setSettingsFeedback,
    githubRepoUrl,
  } = useWorkspaceProjectPanelProjectStateContext();

  const {
    isCreateModalOpen,
    setIsCreateModalOpen,
    labelName,
    setLabelName,
    labelColor,
    setLabelColor,
    labelDescription,
    setLabelDescription,
    labelFormError,
    setLabelFormError,
    editingLabelId,
    setEditingLabelId,
    editingLabelName,
    setEditingLabelName,
    editingLabelColor,
    setEditingLabelColor,
    editingLabelDescription,
    setEditingLabelDescription,
    editingLabelError,
    setEditingLabelError,
    editingLabelLoading,
    setEditingLabelLoading,
    nextLabelSortOrder,
    activeLabel,
    clearLabelEditor,
  } = useWorkspaceProjectPanelLabelStateContext();

  const openCreateProjectModal = useCallback(() => {
    setIsCreateModalOpen(true);
  }, [setIsCreateModalOpen]);

  const closeCreateProjectModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, [setIsCreateModalOpen]);

  const createProject = useCallback(
    async (project: { name: string; description: string; key: string }) => {
      try {
        await onCreateProject({
          name: project.name.trim(),
          key: sanitizeProjectKey(project.key),
          description: project.description.trim(),
        });
        setIsCreateModalOpen(false);
      } catch {
        // The parent surfaces the error message.
      }
    },
    [onCreateProject, setIsCreateModalOpen]
  );

  const createLabel = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setLabelFormError(null);

      if (!managedProject || !labelName.trim()) {
        setLabelFormError('Please enter a label name.');
        return;
      }

      try {
        await onCreateLabel({
          projectId: managedProject.id,
          name: labelName.trim(),
          color: labelColor,
          description: labelDescription.trim(),
          sortOrder: nextLabelSortOrder,
        });

        setLabelName('');
        setLabelColor(DEFAULT_LABEL_COLOR);
        setLabelDescription('');
      } catch {
        // The parent surfaces the error message.
      }
    },
    [
      labelColor,
      labelDescription,
      labelName,
      managedProject,
      nextLabelSortOrder,
      onCreateLabel,
      setLabelColor,
      setLabelDescription,
      setLabelFormError,
      setLabelName,
    ]
  );

  const startEditingLabel = useCallback(
    (label: Label) => {
      setEditingLabelId(label.id);
      setEditingLabelName(label.name);
      setEditingLabelColor(label.color);
      setEditingLabelDescription(label.description || '');
      setEditingLabelError(null);
    },
    [setEditingLabelColor, setEditingLabelDescription, setEditingLabelError, setEditingLabelId, setEditingLabelName]
  );

  const updateLabel = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!editingLabelId || !editingLabelName.trim()) {
        setEditingLabelError('Please enter a label name.');
        return;
      }

      setEditingLabelLoading(true);
      setEditingLabelError(null);

      try {
        await onUpdateLabel(editingLabelId, {
          name: editingLabelName.trim(),
          color: editingLabelColor,
          description: editingLabelDescription.trim(),
        });
      } catch (error) {
        setEditingLabelError(error instanceof Error ? error.message : 'Failed to update label.');
      } finally {
        setEditingLabelLoading(false);
      }
    },
    [
      editingLabelColor,
      editingLabelDescription,
      editingLabelId,
      editingLabelName,
      onUpdateLabel,
      setEditingLabelError,
      setEditingLabelLoading,
    ]
  );

  const deleteLabel = useCallback(async () => {
    if (!activeLabel) {
      return;
    }

    const confirmDelete =
      typeof window === 'undefined' ? true : window.confirm(`Delete label "${activeLabel.name}"? It will be removed from all tickets.`);
    if (!confirmDelete) {
      return;
    }

    setEditingLabelLoading(true);
    setEditingLabelError(null);

    try {
      await onDeleteLabel(activeLabel.id);
      clearLabelEditor();
    } catch (error) {
      setEditingLabelError(error instanceof Error ? error.message : 'Failed to delete label.');
    } finally {
      setEditingLabelLoading(false);
    }
  }, [activeLabel, clearLabelEditor, onDeleteLabel, setEditingLabelError, setEditingLabelLoading]);

  const selectProject = useCallback(
    (projectId: string) => {
      setManagedProjectId(projectId);
      clearLabelEditor();
      onSelectProject(projectId);
    },
    [clearLabelEditor, onSelectProject, setManagedProjectId]
  );

  const saveProjectSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!managedProject) {
        return;
      }

      const { url, error } = validateGithubRepoUrl(githubRepoUrl);
      if (error) {
        setSettingsFeedback(createProjectSettingsFeedback('error', error));
        return;
      }

      setIsProjectSettingsSaving(true);
      setSettingsFeedback(null);

      try {
        await onUpdateProject(managedProject.id, {
          githubRepoUrl: url || null,
        });
        setSettingsFeedback(createProjectSettingsFeedback('success', 'Project settings updated successfully.'));
      } catch (error) {
        setSettingsFeedback(
          createProjectSettingsFeedback('error', error instanceof Error ? error.message : 'Failed to update project settings.')
        );
      } finally {
        setIsProjectSettingsSaving(false);
      }
    },
    [githubRepoUrl, managedProject, onUpdateProject, setIsProjectSettingsSaving, setSettingsFeedback]
  );

  return (
    <WorkspaceProjectPanelActionsContext.Provider
      value={{
        isCreateProjectModalOpen: isCreateModalOpen,
        openCreateProjectModal,
        closeCreateProjectModal,
        createProject,
        selectProject,
        createLabel,
        startEditingLabel,
        updateLabel,
        deleteLabel,
        saveProjectSettings,
      }}
    >
      {children}
    </WorkspaceProjectPanelActionsContext.Provider>
  );
}

export function useWorkspaceProjectPanelActionsContext(): WorkspaceProjectPanelActionsContextValue {
  const context = useContext(WorkspaceProjectPanelActionsContext);
  if (!context) {
    throw new Error('useWorkspaceProjectPanelActionsContext must be used inside WorkspaceProjectPanelActionsContextProvider.');
  }

  return context;
}
