import { createContext, type FormEvent, type JSX, useCallback, useContext, useMemo, type PropsWithChildren } from 'react';

import type { Label } from '../../../context/TicketContext';
import {
  createProjectSettingsFeedback,
  createWorkspaceProjectPanelCreateProjectFormFactory,
  createWorkspaceProjectPanelLabelFormFactory,
  DEFAULT_LABEL_COLOR,
  validateGithubRepoUrl,
} from '../utils/WorkspaceProjectPanel';
import type { WorkspaceProjectPanelProps } from '../types/WorkspaceProjectPanel';
import { useWorkspaceProjectPanelLabelStateContext } from './WorkspaceProjectPanelLabelStateContextCore';
import { useWorkspaceProjectPanelProjectStateContext } from './WorkspaceProjectPanelProjectStateContext';

type WorkspaceProjectPanelActionCallbacks = Pick<
  WorkspaceProjectPanelProps,
  'onSelectProject' | 'onCreateProject' | 'onUpdateProject' | 'onCreateLabel' | 'onUpdateLabel' | 'onDeleteLabel'
>;
type WorkspaceProjectPanelActionOptions = WorkspaceProjectPanelActionCallbacks & {
  confirmDeleteLabel?: (message: string) => boolean | Promise<boolean>;
};

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
  confirmDeleteLabel,
}: PropsWithChildren<WorkspaceProjectPanelActionOptions>): JSX.Element {
  const {
    buildValidatedPayload,
  } = useMemo(() => createWorkspaceProjectPanelCreateProjectFormFactory(), []);
  const {
    buildValidatedPayload: buildValidatedLabelPayload,
  } = useMemo(() => createWorkspaceProjectPanelLabelFormFactory(), []);

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

  const deleteLabelConfirmation =
    confirmDeleteLabel ??
    ((message: string) => (typeof window === 'undefined' ? true : window.confirm(message)));

  const openCreateProjectModal = useCallback(() => {
    setIsCreateModalOpen(true);
  }, [setIsCreateModalOpen]);

  const closeCreateProjectModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, [setIsCreateModalOpen]);

  const createProject = useCallback(
    async (project: { name: string; description: string; key: string }) => {
      const { value, error } = buildValidatedPayload({
        name: project.name,
        description: project.description,
        key: project.key,
      });
      if (error) {
        throw new Error(error);
      }

      await onCreateProject({
        name: value.name,
        key: value.key,
        description: value.description,
      });
      setIsCreateModalOpen(false);
    },
    [buildValidatedPayload, onCreateProject, setIsCreateModalOpen]
  );

  const createLabel = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setLabelFormError(null);

      const { value, error } = buildValidatedLabelPayload({
        name: labelName,
        color: labelColor,
        description: labelDescription,
      });

      if (!managedProject || error) {
        setLabelFormError(error || 'Please select a project before creating labels.');
        return;
      }

      try {
        await onCreateLabel({
          projectId: managedProject.id,
          name: value.name,
          color: value.color,
          description: value.description,
          sortOrder: nextLabelSortOrder,
        });

        setLabelName('');
        setLabelColor(DEFAULT_LABEL_COLOR);
        setLabelDescription('');
      } catch (error) {
        setLabelFormError(error instanceof Error ? error.message : 'Failed to create label.');
      }
    },
    [
      labelColor,
      labelDescription,
      labelName,
      buildValidatedLabelPayload,
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

      const { value, error } = buildValidatedLabelPayload({
        name: editingLabelName,
        color: editingLabelColor,
        description: editingLabelDescription,
      });

      if (!editingLabelId || error) {
        setEditingLabelError(error || 'Please select a label to edit.');
        return;
      }

      setEditingLabelLoading(true);
      setEditingLabelError(null);

      try {
        await onUpdateLabel(editingLabelId, {
          name: value.name,
          color: value.color,
          description: value.description,
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
      buildValidatedLabelPayload,
      onUpdateLabel,
      setEditingLabelError,
      setEditingLabelLoading,
    ]
  );

  const deleteLabel = useCallback(async () => {
    if (!activeLabel) {
      return;
    }

    const confirmDelete = await deleteLabelConfirmation(
      `Delete label "${activeLabel.name}"? It will be removed from all tickets.`
    );
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
  }, [activeLabel, clearLabelEditor, deleteLabelConfirmation, onDeleteLabel, setEditingLabelError, setEditingLabelLoading]);

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

  const contextValue = useMemo(
    () => ({
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
    }),
    [
      closeCreateProjectModal,
      createLabel,
      createProject,
      deleteLabel,
      isCreateModalOpen,
      openCreateProjectModal,
      saveProjectSettings,
      selectProject,
      startEditingLabel,
      updateLabel,
    ]
  );

  return (
    <WorkspaceProjectPanelActionsContext.Provider value={contextValue}>
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
