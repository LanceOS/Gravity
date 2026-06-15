import { useCallback } from 'react';

import { useWorkspaceProjectPanelLabelState, useWorkspaceProjectPanelProjectState } from '../hooks';
import {
  DEFAULT_LABEL_COLOR,
  createProjectSettingsFeedback,
  sanitizeProjectKey,
  validateGithubRepoUrl,
} from '../utils/WorkspaceProjectPanel';
import type { WorkspaceProjectPanelProps } from '../types/WorkspaceProjectPanel';
import { ProjectCreateOverlay } from '../components/ProjectCreateOverlay';
import { ProjectSelectionRail } from '../components/ProjectSelectionRail';
import { WorkspaceProjectCurrentProjectSection } from '../components/WorkspaceProjectCurrentProjectSection';
import { WorkspaceProjectHeader } from '../components/WorkspaceProjectHeader';
import { WorkspaceProjectLabelCreateForm } from '../components/WorkspaceProjectLabelCreateForm';
import { WorkspaceProjectLabelEditor } from '../components/WorkspaceProjectLabelEditor';
import { WorkspaceProjectLabelList } from '../components/WorkspaceProjectLabelList';
import { WorkspaceProjectLabelNoSelectionMessage } from '../components/WorkspaceProjectLabelNoSelectionMessage';
import { WorkspaceProjectLabelSectionErrors } from '../components/WorkspaceProjectLabelSectionErrors';
import { WorkspaceProjectLabelSectionHeader } from '../components/WorkspaceProjectLabelSectionHeader';
import { WorkspaceProjectSettingsSection } from '../components/WorkspaceProjectSettingsSection';
import type { Label } from '../../../context/TicketContext';

export function WorkspaceProjectPanelPage({
  workspaceName,
  projects,
  activeProjectId,
  defaultProjectId,
  labels,
  projectCreateLoading,
  projectCreateError,
  labelCreateLoading,
  labelCreateError,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
}: WorkspaceProjectPanelProps) {
  const {
    setManagedProjectId,
    managedProject,
    currentProject,
    projectStrip,
    shouldShowLabels,
    isProjectSettingsSaving,
    setIsProjectSettingsSaving,
    settingsFeedback,
    setSettingsFeedback,
    githubRepoUrl,
    setGithubRepoUrl,
  } = useWorkspaceProjectPanelProjectState({
    projects,
    activeProjectId,
  });

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
    sortedLabels,
    activeLabel,
    nextLabelSortOrder,
    clearLabelEditor,
  } = useWorkspaceProjectPanelLabelState({
    labels,
    managedProject,
    shouldShowLabels,
  });

  const isLabelBusy = labelCreateLoading || editingLabelLoading;

  const handleCreateProject = useCallback(
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

  const handleCreateLabel = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setLabelFormError(null);

      if (!managedProject || !labelName.trim()) {
        setLabelFormError('Please enter a label name.');
        return;
      }

      try {
        const labelPayload = {
          projectId: managedProject.id,
          name: labelName.trim(),
          color: labelColor,
          description: labelDescription.trim(),
          sortOrder: nextLabelSortOrder,
        };

        await onCreateLabel(labelPayload);
        setLabelName('');
        setLabelColor(DEFAULT_LABEL_COLOR);
        setLabelDescription('');
      } catch {
        // The parent surfaces the error message.
      }
    },
    [labelColor, labelDescription, labelName, managedProject, nextLabelSortOrder, onCreateLabel, setLabelFormError, setLabelColor, setLabelDescription, setLabelName]
  );

  const handleStartEditingLabel = useCallback(
    (label: Label) => {
      setEditingLabelId(label.id);
      setEditingLabelName(label.name);
      setEditingLabelColor(label.color);
      setEditingLabelDescription(label.description || '');
      setEditingLabelError(null);
    },
    [setEditingLabelColor, setEditingLabelDescription, setEditingLabelError, setEditingLabelId, setEditingLabelName]
  );

  const handleUpdateLabel = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
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
    [editingLabelColor, editingLabelDescription, editingLabelId, editingLabelName, onUpdateLabel, setEditingLabelError, setEditingLabelLoading]
  );

  const handleDeleteLabel = useCallback(async () => {
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

  const handleSelectProject = useCallback(
    (projectId: string) => {
      setManagedProjectId(projectId);
      clearLabelEditor();
      onSelectProject(projectId);
    },
    [clearLabelEditor, onSelectProject, setManagedProjectId]
  );

  const handleSaveProjectSettings = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
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

  const handleCreateProjectModalOpen = useCallback(() => {
    setIsCreateModalOpen(true);
  }, [setIsCreateModalOpen]);

  return (
    <section className="workspace-page__projects-panel">
      <WorkspaceProjectHeader
        workspaceName={workspaceName}
        projectCount={projects.length}
        projectCreateError={projectCreateError}
        onCreateProject={handleCreateProjectModalOpen}
      />

      <WorkspaceProjectCurrentProjectSection
        currentProject={currentProject}
        defaultProjectId={defaultProjectId}
        labelCount={sortedLabels.length}
      />

      {managedProject ? (
        <section className="workspace-page__project-domains">
          <WorkspaceProjectLabelSectionHeader managedProjectName={managedProject.name} />
          <WorkspaceProjectLabelSectionErrors labelFormError={labelFormError} labelCreateError={labelCreateError} />
          <WorkspaceProjectLabelList
            labels={sortedLabels}
            activeLabelId={editingLabelId}
            onSelectLabel={handleStartEditingLabel}
            managedProjectName={managedProject.name}
          />
          {activeLabel ? (
            <WorkspaceProjectLabelEditor
              activeLabel={activeLabel}
              editingLabelName={editingLabelName}
              editingLabelColor={editingLabelColor}
              editingLabelDescription={editingLabelDescription}
              isLabelBusy={isLabelBusy}
              editingLabelLoading={editingLabelLoading}
              editingLabelError={editingLabelError}
              onEditingLabelNameChange={setEditingLabelName}
              onEditingLabelColorChange={setEditingLabelColor}
              onEditingLabelDescriptionChange={setEditingLabelDescription}
              onSaveLabel={handleUpdateLabel}
              onDeleteLabel={handleDeleteLabel}
              onCancelEdit={clearLabelEditor}
            />
          ) : (
            <WorkspaceProjectLabelNoSelectionMessage />
          )}
          <WorkspaceProjectLabelCreateForm
            labelName={labelName}
            labelColor={labelColor}
            labelDescription={labelDescription}
            isLabelBusy={isLabelBusy}
            labelCreateLoading={labelCreateLoading}
            onLabelNameChange={setLabelName}
            onLabelColorChange={setLabelColor}
            onLabelDescriptionChange={setLabelDescription}
            onSubmit={handleCreateLabel}
          />
        </section>
      ) : null}

      {managedProject ? (
        <WorkspaceProjectSettingsSection
          managedProjectName={managedProject.name}
          githubRepoUrl={githubRepoUrl}
          isSaving={isProjectSettingsSaving}
          settingsFeedback={settingsFeedback}
          onGithubRepoUrlChange={setGithubRepoUrl}
          onSaveSettings={handleSaveProjectSettings}
        />
      ) : null}

      {projects.length > 0 ? (
        <ProjectSelectionRail
          projects={projectStrip}
          selectedProjectId={managedProject?.id || activeProjectId || null}
          defaultProjectId={defaultProjectId}
          onSelectProject={handleSelectProject}
        />
      ) : null}

      {isCreateModalOpen ? (
        <ProjectCreateOverlay
          loading={projectCreateLoading}
          errorMessage={projectCreateError}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmitProject={handleCreateProject}
        />
      ) : null}
    </section>
  );
}
