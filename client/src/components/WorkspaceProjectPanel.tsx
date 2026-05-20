import { useEffect, useMemo, useState } from 'react';
import { FolderPlus, Loader2, Plus } from 'lucide-react';
import type { Project } from '../context/TicketContext';

interface WorkspaceProjectPanelProps {
  workspaceName: string;
  projects: Project[];
  activeProjectId: string;
  defaultProjectId: string | null;
  projectCreateLoading: boolean;
  projectCreateError: string | null;
  projectManageLoading: boolean;
  projectManageError: string | null;
  defaultProjectLoading: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  onUpdateProject: (projectId: string, updates: { name: string; description: string; status: Project['status'] }) => Promise<void>;
  onSetDefaultProject: (projectId: string) => Promise<void>;
}

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Archived',
};

export function WorkspaceProjectPanel({
  workspaceName,
  projects,
  activeProjectId,
  defaultProjectId,
  projectCreateLoading,
  projectCreateError,
  projectManageLoading,
  projectManageError,
  defaultProjectLoading,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onSetDefaultProject,
}: WorkspaceProjectPanelProps) {
  const [isComposerOpen, setIsComposerOpen] = useState(projects.length === 0);
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [managedProjectId, setManagedProjectId] = useState('');
  const [managedName, setManagedName] = useState('');
  const [managedDescription, setManagedDescription] = useState('');
  const [managedStatus, setManagedStatus] = useState<Project['status']>('active');

  const managedProject = useMemo(
    () => projects.find((project) => project.id === managedProjectId) || null,
    [projects, managedProjectId]
  );

  useEffect(() => {
    if (projects.length === 0) {
      setIsComposerOpen(true);
    }
  }, [projects.length]);

  useEffect(() => {
    if (projects.length === 0) {
      setManagedProjectId('');
      return;
    }

    if (activeProjectId && projects.some((project) => project.id === activeProjectId)) {
      setManagedProjectId(activeProjectId);
      return;
    }

    if (!projects.some((project) => project.id === managedProjectId)) {
      setManagedProjectId(projects[0].id);
    }
  }, [activeProjectId, managedProjectId, projects]);

  useEffect(() => {
    if (!managedProject) {
      setManagedName('');
      setManagedDescription('');
      setManagedStatus('active');
      return;
    }

    setManagedName(managedProject.name);
    setManagedDescription(managedProject.description || '');
    setManagedStatus(managedProject.status);
  }, [managedProject]);

  const handleCreateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await onCreateProject({
        name: projectName.trim(),
        key: projectKey.trim(),
        description: projectDescription.trim(),
      });
      setProjectName('');
      setProjectKey('');
      setProjectDescription('');
      setIsComposerOpen(false);
    } catch {
      // The parent surfaces the error message.
    }
  };

  const handleSaveProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!managedProject) {
      return;
    }

    try {
      await onUpdateProject(managedProject.id, {
        name: managedName.trim(),
        description: managedDescription.trim(),
        status: managedStatus,
      });
    } catch {
      // The parent surfaces the error message.
    }
  };

  const isDefaultProject = managedProject?.id === defaultProjectId;

  return (
    <section className="workspace-page__projects-panel">
      <div className="workspace-page__projects-header">
        <div className="workspace-page__projects-title-block">
          <div className="workspace-page__projects-eyebrow">Workspace Projects</div>
          <div className="workspace-page__projects-title-row">
            <h2 className="workspace-page__projects-title">{workspaceName}</h2>
            <span className="workspace-page__projects-count">{projects.length} total</span>
          </div>
          <p className="workspace-page__projects-subtitle">Create and switch the projects that belong to this workspace without leaving the shell.</p>
        </div>

        <div className="workspace-page__projects-actions">
          <button
            type="button"
            className="workspace-page__projects-button workspace-page__projects-button--primary"
            onClick={() => setIsComposerOpen((previous) => !previous)}
          >
            {isComposerOpen ? <FolderPlus size={14} /> : <Plus size={14} />}
            <span>{isComposerOpen ? 'Hide Project Form' : 'New Project'}</span>
          </button>
        </div>
      </div>

      {projectCreateError ? <div className="workspace-page__project-feedback workspace-page__project-feedback--error">{projectCreateError}</div> : null}
      {projectManageError ? <div className="workspace-page__project-feedback workspace-page__project-feedback--error">{projectManageError}</div> : null}

      {isComposerOpen ? (
        <form className="workspace-page__project-composer" onSubmit={handleCreateSubmit}>
          <div className="workspace-page__project-form-grid">
            <label className="workspace-page__project-field">
              <span className="workspace-page__project-label">Project Name</span>
              <input
                className="workspace-page__project-input"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Core Platform"
                required
              />
            </label>

            <label className="workspace-page__project-field workspace-page__project-field--compact">
              <span className="workspace-page__project-label">Project Key</span>
              <input
                className="workspace-page__project-input workspace-page__project-input--key"
                value={projectKey}
                onChange={(event) => setProjectKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                placeholder="CORE"
                maxLength={8}
                required
              />
            </label>

            <label className="workspace-page__project-field workspace-page__project-field--wide">
              <span className="workspace-page__project-label">Description</span>
              <textarea
                className="workspace-page__project-input workspace-page__project-input--textarea"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                placeholder="Describe the scope of this project inside the workspace."
                rows={3}
              />
            </label>
          </div>

          <div className="workspace-page__project-form-actions">
            {projects.length > 0 ? (
              <button type="button" className="workspace-page__projects-button" onClick={() => setIsComposerOpen(false)}>
                Cancel
              </button>
            ) : null}

            <button type="submit" className="workspace-page__projects-button workspace-page__projects-button--primary" disabled={projectCreateLoading}>
              {projectCreateLoading ? <Loader2 size={14} className="workspace-page__spin" /> : <FolderPlus size={14} />}
              <span>{projectCreateLoading ? 'Creating Project...' : 'Create Project'}</span>
            </button>
          </div>
        </form>
      ) : null}

      {projects.length > 0 ? (
        <div className="workspace-page__project-grid">
          {projects.map((project) => {
            const isActiveProject = activeProjectId === project.id;

            return (
              <button
                key={project.id}
                type="button"
                className={`workspace-page__project-card ${isActiveProject ? 'workspace-page__project-card--active' : ''}`}
                onClick={() => {
                  setManagedProjectId(project.id);
                  onSelectProject(project.id);
                }}
              >
                <div className="workspace-page__project-card-head">
                  <span className="workspace-page__project-key">{project.key}</span>
                  <div className="workspace-page__project-card-badges">
                    {project.id === defaultProjectId ? <span className="workspace-page__project-badge">Default</span> : null}
                    <span className={`workspace-page__project-status workspace-page__project-status--${project.status}`}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </span>
                  </div>
                </div>

                <div className="workspace-page__project-name">{project.name}</div>
                <p className="workspace-page__project-description">{project.description || 'No description added yet.'}</p>

                <div className="workspace-page__project-meta">
                  <span className="workspace-page__project-meta-label">Selection</span>
                  <span className="workspace-page__project-meta-value">{isActiveProject ? 'Current' : 'Available'}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {managedProject ? (
        <form className="workspace-page__project-manager" onSubmit={handleSaveProject}>
          <div className="workspace-page__project-manager-header">
            <div>
              <div className="workspace-page__projects-eyebrow">Manage Project</div>
              <h3 className="workspace-page__project-manager-title">{managedProject.key} controls</h3>
            </div>
            <div className="workspace-page__project-manager-actions">
              <button
                type="button"
                className={`workspace-page__projects-button ${isDefaultProject ? 'workspace-page__projects-button--active' : ''}`}
                onClick={() => void onSetDefaultProject(managedProject.id)}
                disabled={defaultProjectLoading || isDefaultProject}
              >
                {defaultProjectLoading ? <Loader2 size={14} className="workspace-page__spin" /> : null}
                <span>{isDefaultProject ? 'Workspace Default' : 'Set as Default'}</span>
              </button>
            </div>
          </div>

          <div className="workspace-page__project-form-grid">
            <label className="workspace-page__project-field">
              <span className="workspace-page__project-label">Project Name</span>
              <input
                className="workspace-page__project-input"
                value={managedName}
                onChange={(event) => setManagedName(event.target.value)}
                required
                disabled={projectManageLoading}
              />
            </label>

            <label className="workspace-page__project-field workspace-page__project-field--compact">
              <span className="workspace-page__project-label">Project Key</span>
              <input className="workspace-page__project-input workspace-page__project-input--key" value={managedProject.key} disabled />
            </label>

            <label className="workspace-page__project-field workspace-page__project-field--compact">
              <span className="workspace-page__project-label">Lifecycle</span>
              <select
                className="workspace-page__project-input"
                value={managedStatus}
                onChange={(event) => setManagedStatus(event.target.value as Project['status'])}
                disabled={projectManageLoading}
              >
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="completed">Archived</option>
              </select>
            </label>

            <label className="workspace-page__project-field workspace-page__project-field--wide">
              <span className="workspace-page__project-label">Description</span>
              <textarea
                className="workspace-page__project-input workspace-page__project-input--textarea"
                value={managedDescription}
                onChange={(event) => setManagedDescription(event.target.value)}
                rows={3}
                disabled={projectManageLoading}
              />
            </label>
          </div>

          <div className="workspace-page__project-form-actions">
            <button type="submit" className="workspace-page__projects-button workspace-page__projects-button--primary" disabled={projectManageLoading}>
              {projectManageLoading ? <Loader2 size={14} className="workspace-page__spin" /> : null}
              <span>{projectManageLoading ? 'Saving Project...' : 'Save Project'}</span>
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}