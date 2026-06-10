import { useCallback, useEffect, useMemo, useState } from 'react';
import { PencilLine, Plus, Trash2 } from 'lucide-react';
import { Button, TextInput, Textarea } from '@library';
import { ProjectCreateOverlay } from './ProjectCreateOverlay';
import { ProjectSelectionRail } from './ProjectSelectionRail';
import type { WorkspaceProjectPanelProps } from '../types/WorkspaceProjectPanel';
import type { Label } from '../../../context/TicketContext';
import { PROJECT_STATUS_LABELS, sanitizeProjectKey } from '../utils/WorkspaceProjectPanel';

const DEFAULT_LABEL_COLOR = '#3b82f6';

export function WorkspaceProjectPanel({
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
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
}: WorkspaceProjectPanelProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [managedProjectId, setManagedProjectId] = useState('');
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState(DEFAULT_LABEL_COLOR);
  const [labelDescription, setLabelDescription] = useState('');
  const [labelFormError, setLabelFormError] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelName, setEditingLabelName] = useState('');
  const [editingLabelColor, setEditingLabelColor] = useState(DEFAULT_LABEL_COLOR);
  const [editingLabelDescription, setEditingLabelDescription] = useState('');
  const [editingLabelError, setEditingLabelError] = useState<string | null>(null);
  const [editingLabelLoading, setEditingLabelLoading] = useState(false);
  const isLabelBusy = labelCreateLoading || editingLabelLoading;

  const managedProject = useMemo(
    () => projects.find((project) => project.id === managedProjectId) || null,
    [projects, managedProjectId]
  );

  const currentProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || managedProject || projects[0] || null,
    [activeProjectId, managedProject, projects]
  );

  const projectStrip = useMemo(() => {
    if (!currentProject) {
      return projects;
    }

    return [currentProject, ...projects.filter((project) => project.id !== currentProject.id)];
  }, [currentProject, projects]);

  const shouldShowLabels = useMemo(() => {
    if (!activeProjectId) {
      return true;
    }

    return managedProject?.id === activeProjectId;
  }, [activeProjectId, managedProject]);

  const sortedLabels = useMemo(
    () =>
      shouldShowLabels
        ? [...labels].sort((first, second) => first.name.localeCompare(second.name))
        : [],
    [labels, shouldShowLabels]
  );

  const activeLabel = useMemo(
    () => (editingLabelId ? sortedLabels.find((label) => label.id === editingLabelId) || null : null),
    [editingLabelId, sortedLabels]
  );

  const nextLabelSortOrder = useMemo(() => {
    if (!managedProject) {
      return 0;
    }

    return sortedLabels.reduce((maxSortOrder, label) => Math.max(maxSortOrder, Number(label.sortOrder ?? 0)), -1) + 1;
  }, [managedProject, sortedLabels]);

  const clearLabelEditor = useCallback(() => {
    setEditingLabelId(null);
    setEditingLabelName('');
    setEditingLabelColor(DEFAULT_LABEL_COLOR);
    setEditingLabelDescription('');
    setEditingLabelError(null);
  }, []);

  useEffect(() => {
    if (projects.length === 0) {
      setManagedProjectId('');
      clearLabelEditor();
      return;
    }

    if (activeProjectId && projects.some((project) => project.id === activeProjectId)) {
      setManagedProjectId(activeProjectId);
      return;
    }

    if (!projects.some((project) => project.id === managedProjectId)) {
      setManagedProjectId(projects[0].id);
    }
  }, [activeProjectId, clearLabelEditor, managedProjectId, projects]);

  useEffect(() => {
    if (!editingLabelId) {
      return;
    }

    const nextLabel = sortedLabels.find((label) => label.id === editingLabelId);
    if (!nextLabel) {
      clearLabelEditor();
      return;
    }

    setEditingLabelName(nextLabel.name);
    setEditingLabelColor(nextLabel.color);
    setEditingLabelDescription(nextLabel.description || '');
  }, [clearLabelEditor, editingLabelId, sortedLabels]);

  const handleCreateProject = async (project: { name: string; description: string; key: string }) => {
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
  };

  const handleCreateLabel = async (event: React.FormEvent<HTMLFormElement>) => {
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
  };

  const handleStartEditingLabel = (label: Label) => {
    setEditingLabelId(label.id);
    setEditingLabelName(label.name);
    setEditingLabelColor(label.color);
    setEditingLabelDescription(label.description || '');
    setEditingLabelError(null);
  };

  const handleUpdateLabel = async (event: React.FormEvent<HTMLFormElement>) => {
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
  };

  const handleDeleteLabel = async () => {
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
  };

  const handleSelectProject = (projectId: string) => {
    setManagedProjectId(projectId);
    clearLabelEditor();
    onSelectProject(projectId);
  };

  return (
    <section className="workspace-page__projects-panel">
      <div className="workspace-page__projects-header">
        <div className="workspace-page__projects-title-block">
          <div className="workspace-page__projects-eyebrow">Workspace Projects</div>
          <div className="workspace-page__projects-title-row">
            <h2 className="workspace-page__projects-title">{workspaceName}</h2>
            <span className="workspace-page__projects-count">{projects.length} total</span>
          </div>
          <p className="workspace-page__projects-subtitle">Create and switch projects in this workspace.</p>
        </div>

        <div className="workspace-page__projects-actions">
          <button
            type="button"
            className="workspace-page__projects-button workspace-page__projects-button--primary"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={14} />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {projectCreateError ? <div className="workspace-page__project-feedback workspace-page__project-feedback--error">{projectCreateError}</div> : null}

      {currentProject ? (
        <article className="workspace-page__current-project">
          <div className="workspace-page__current-project-main">
            <div className="workspace-page__projects-eyebrow">Current Project</div>
            <div className="workspace-page__current-project-heading">
              <div className="workspace-page__project-key">{currentProject.key}</div>
              <h3 className="workspace-page__current-project-title">{currentProject.name}</h3>
              <div className="workspace-page__current-project-badges">
                {currentProject.id === defaultProjectId ? <span className="workspace-page__project-badge">Default</span> : null}
                <span className={`workspace-page__project-status workspace-page__project-status--${currentProject.status}`}>
                  {PROJECT_STATUS_LABELS[currentProject.status]}
                </span>
              </div>
            </div>
          </div>

          <div className="workspace-page__current-project-summary">
            <div className="workspace-page__current-project-meta">
              <span className="workspace-page__current-project-meta-pill">
                {currentProject.id === defaultProjectId ? 'Default project' : 'Workspace project'}
              </span>
              <span className="workspace-page__current-project-meta-pill">
                {sortedLabels.length} {sortedLabels.length === 1 ? 'label' : 'labels'}
              </span>
            </div>
            <p className="workspace-page__current-project-copy">
              {currentProject.description || 'Add a short description for this project.'}
            </p>
          </div>
        </article>
      ) : (
        <div className="workspace-page__project-empty-shell">
          <div className="workspace-page__empty-state-title">No projects in this workspace yet</div>
          <p className="workspace-page__empty-state-copy">
            Create the first project to unlock ticket, label, and cycle management for this workspace.
          </p>
        </div>
      )}

      {managedProject ? (
        <section className="workspace-page__project-domains">
          <div className="workspace-page__project-domain-header">
            <div>
              <div className="workspace-page__projects-eyebrow">Project Labels</div>
              <h3 className="workspace-page__project-manager-title">{managedProject.name} labels</h3>
            </div>
            <p className="workspace-page__project-browser-copy workspace-page__project-browser-copy--left">Use labels for ticket assignment and list sorting.</p>
          </div>

          {labelFormError || labelCreateError ? (
            <div className="workspace-page__project-feedback workspace-page__project-feedback--error">
              {labelFormError || labelCreateError}
            </div>
          ) : null}

          <div className="workspace-page__domain-list">
            {sortedLabels.length > 0 ? (
              sortedLabels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  className={`workspace-page__domain-chip workspace-page__domain-chip--button ${
                    editingLabelId === label.id ? 'workspace-page__domain-chip--active' : ''
                  }`}
                  onClick={() => handleStartEditingLabel(label)}
                  title={label.description || label.name}
                  aria-pressed={editingLabelId === label.id}
                >
                  <span className="workspace-page__domain-chip-swatch" style={{ background: label.color }} />
                  <span>{label.name}</span>
                </button>
              ))
            ) : (
              <div className="workspace-page__domain-empty">No labels yet. Create the first label for {managedProject.name}.</div>
            )}
          </div>

          {activeLabel ? (
            <section className="workspace-page__label-editor">
              <div className="workspace-page__project-domain-header">
                <div>
                  <div className="workspace-page__projects-eyebrow">Edit Label</div>
                  <h3 className="workspace-page__project-manager-title">{activeLabel.name}</h3>
                </div>
                <p className="workspace-page__project-browser-copy workspace-page__project-browser-copy--left">
                  Update the label name, color, or description. Delete removes it from every ticket.
                </p>
              </div>

              {editingLabelError ? (
                <div className="workspace-page__project-feedback workspace-page__project-feedback--error">
                  {editingLabelError}
                </div>
              ) : null}

              <form className="workspace-page__label-editor-form" onSubmit={handleUpdateLabel}>
                <div className="workspace-page__label-editor-grid">
                  <TextInput
                    label="Label Name"
                    value={editingLabelName}
                    onChange={(event) => setEditingLabelName(event.target.value)}
                    placeholder="Frontend Platform"
                    disabled={isLabelBusy}
                    required
                  />

                  <div className="workspace-page__project-field workspace-page__project-field--compact">
                    <span className="workspace-page__project-label">Color</span>
                    <input
                      type="color"
                      className="workspace-page__project-color-input"
                      value={editingLabelColor}
                      onChange={(event) => setEditingLabelColor(event.target.value)}
                      disabled={isLabelBusy}
                      style={{ height: '36px', padding: '2px', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                <Textarea
                  label="Description"
                  value={editingLabelDescription}
                  onChange={(event) => setEditingLabelDescription(event.target.value)}
                  placeholder="Explain when this label should be used."
                  rows={3}
                  disabled={isLabelBusy}
                  style={{ gridColumn: '1 / -1' }}
                />

                <div className="workspace-page__label-editor-actions" style={{ gridColumn: '1 / -1' }}>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={editingLabelLoading}
                    disabled={isLabelBusy || !editingLabelName.trim()}
                  >
                    <PencilLine size={14} />
                    <span>Save Label</span>
                  </Button>

                  <Button
                    type="button"
                    variant="danger"
                    loading={editingLabelLoading}
                    disabled={isLabelBusy}
                    onClick={() => void handleDeleteLabel()}
                  >
                    <Trash2 size={14} />
                    <span>Delete Label</span>
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={editingLabelLoading || labelCreateLoading}
                    onClick={clearLabelEditor}
                  >
                    <span>Cancel</span>
                  </Button>
                </div>
              </form>
            </section>
          ) : (
            <div className="workspace-page__domain-empty">
              Select a label to edit its name, color, description, or delete it.
            </div>
          )}

          <form className="workspace-page__domain-form" onSubmit={handleCreateLabel}>
            <TextInput
              label="Label Name"
              value={labelName}
              onChange={(event) => setLabelName(event.target.value)}
              placeholder="Frontend Platform"
              disabled={isLabelBusy}
              required
            />

            <div className="workspace-page__project-field workspace-page__project-field--compact">
              <span className="workspace-page__project-label">Color</span>
              <input
                type="color"
                className="workspace-page__project-color-input"
                value={labelColor}
                onChange={(event) => setLabelColor(event.target.value)}
                disabled={isLabelBusy}
                style={{ height: '36px', padding: '2px', cursor: 'pointer' }}
              />
            </div>

            <Textarea
              label="Description"
              value={labelDescription}
              onChange={(event) => setLabelDescription(event.target.value)}
              placeholder="What does this label represent?"
              rows={3}
              disabled={isLabelBusy}
              style={{ gridColumn: '1 / -1' }}
            />

            <div
              className="workspace-page__project-form-actions workspace-page__project-form-actions--inline"
              style={{ gridColumn: '1 / -1' }}
            >
              <Button
                type="submit"
                variant="primary"
                loading={labelCreateLoading}
                disabled={isLabelBusy || !labelName.trim()}
                style={{ minHeight: '36px' }}
              >
                Create Label
              </Button>
            </div>
          </form>
        </section>
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
