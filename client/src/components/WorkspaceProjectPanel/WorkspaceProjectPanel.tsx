import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { Project } from '../../context/TicketContext';
import { Select } from '../ui/Select';
import { ProjectCreateOverlay } from './components';
import type { WorkspaceProjectPanelProps } from './types';
import { PROJECT_LIFECYCLE_OPTIONS, PROJECT_STATUS_LABELS, sanitizeProjectKey } from './utils';

export function WorkspaceProjectPanel({
  workspaceName,
  projects,
  activeProjectId,
  defaultProjectId,
  domains,
  projectCreateLoading,
  projectCreateError,
  projectManageLoading,
  projectManageError,
  defaultProjectLoading,
  domainCreateLoading,
  domainCreateError,
  onSelectProject,
  onCreateProject,
  onCreateDomain,
  onUpdateProject,
  onSetDefaultProject,
}: WorkspaceProjectPanelProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(projects.length === 0);
  const [managedProjectId, setManagedProjectId] = useState('');
  const [managedName, setManagedName] = useState('');
  const [managedDescription, setManagedDescription] = useState('');
  const [managedStatus, setManagedStatus] = useState<Project['status']>('active');
  const [domainName, setDomainName] = useState('');
  const [domainColor, setDomainColor] = useState('#3b82f6');

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

  const sortedDomains = useMemo(
    () => [...domains].sort((first, second) => first.name.localeCompare(second.name)),
    [domains]
  );

  useEffect(() => {
    if (projects.length === 0) {
      setIsCreateModalOpen(true);
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

  const handleCreateDomain = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!managedProject || !domainName.trim()) {
      return;
    }

    try {
      const domainPayload = {
        projectId: managedProject.id,
        name: domainName.trim(),
        color: domainColor,
      };

      await onCreateDomain(domainPayload);
      setDomainName('');
      setDomainColor('#3b82f6');
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
          <p className="workspace-page__projects-subtitle">Create, switch, and update projects in this workspace.</p>
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
      {projectManageError ? <div className="workspace-page__project-feedback workspace-page__project-feedback--error">{projectManageError}</div> : null}

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
                {managedProject?.id === currentProject.id ? 'Managing now' : 'Available to manage'}
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
            Create the first project to unlock ticket, domain, and cycle management for this workspace.
          </p>
        </div>
      )}

      {projects.length > 0 ? (
        <section className="workspace-page__project-browser">
          <div className="workspace-page__project-browser-header">
            <div>
              <div className="workspace-page__projects-eyebrow">Project Selection</div>
              <h3 className="workspace-page__project-browser-title">Workspace Projects</h3>
            </div>
            <p className="workspace-page__project-browser-copy">Select a project to edit.</p>
          </div>

          <div className="workspace-page__project-strip">
            {projectStrip.map((project) => {
            const isActiveProject = activeProjectId === project.id;
            const isManagedProject = managedProject?.id === project.id;

            return (
              <button
                key={project.id}
                type="button"
                className={`workspace-page__project-strip-card ${isActiveProject ? 'workspace-page__project-strip-card--active' : ''}`}
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
                  <span className="workspace-page__project-meta-label">Workspace</span>
                  <span className="workspace-page__project-meta-value">{isManagedProject ? 'Managing' : isActiveProject ? 'Current' : 'Available'}</span>
                </div>
              </button>
            );
            })}
          </div>
        </section>
      ) : null}

      {managedProject ? (
        <>
          <form className="workspace-page__project-manager" onSubmit={handleSaveProject}>
            <div className="workspace-page__project-manager-header">
              <div>
                <div className="workspace-page__projects-eyebrow">Manage Project</div>
                <h3 className="workspace-page__project-manager-title">{managedProject.name}</h3>
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
                <Select
                  value={managedStatus}
                  onValueChange={(nextStatus) => setManagedStatus(nextStatus as Project['status'])}
                  options={PROJECT_LIFECYCLE_OPTIONS}
                  ariaLabel="Select project lifecycle"
                  disabled={projectManageLoading}
                  triggerClassName="workspace-page__project-input"
                />
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

          <section className="workspace-page__project-domains">
            <div className="workspace-page__project-domain-header">
              <div>
                <div className="workspace-page__projects-eyebrow">Project Domains</div>
                <h3 className="workspace-page__project-manager-title">Domains</h3>
              </div>
              <p className="workspace-page__project-browser-copy">Use domains for ticket assignment and list sorting.</p>
            </div>

            {domainCreateError ? <div className="workspace-page__project-feedback workspace-page__project-feedback--error">{domainCreateError}</div> : null}

            <div className="workspace-page__domain-list">
              {sortedDomains.length > 0 ? (
                sortedDomains.map((domain) => (
                  <div key={domain.id} className="workspace-page__domain-chip">
                    <span className="workspace-page__domain-chip-swatch" style={{ background: domain.color }} />
                    <span>{domain.name}</span>
                  </div>
                ))
              ) : (
                <div className="workspace-page__domain-empty">No domains yet. Create the first domain for {managedProject.name}.</div>
              )}
            </div>

            <form className="workspace-page__domain-form" onSubmit={handleCreateDomain}>
              <label className="workspace-page__project-field">
                <span className="workspace-page__project-label">Domain Name</span>
                <input
                  className="workspace-page__project-input"
                  value={domainName}
                  onChange={(event) => setDomainName(event.target.value)}
                  placeholder="Frontend Platform"
                  disabled={domainCreateLoading}
                  required
                />
              </label>

              <label className="workspace-page__project-field workspace-page__project-field--compact">
                <span className="workspace-page__project-label">Color</span>
                <input
                  type="color"
                  className="workspace-page__project-color-input"
                  value={domainColor}
                  onChange={(event) => setDomainColor(event.target.value)}
                  disabled={domainCreateLoading}
                />
              </label>

              <div className="workspace-page__project-form-actions workspace-page__project-form-actions--inline">
                <button type="submit" className="workspace-page__projects-button workspace-page__projects-button--primary" disabled={domainCreateLoading}>
                  {domainCreateLoading ? <Loader2 size={14} className="workspace-page__spin" /> : null}
                  <span>{domainCreateLoading ? 'Creating Domain...' : 'Create Domain'}</span>
                </button>
              </div>
            </form>
          </section>
        </>
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