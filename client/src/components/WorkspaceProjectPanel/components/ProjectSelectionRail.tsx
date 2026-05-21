import type { ProjectSelectionRailProps } from '../types';
import { PROJECT_STATUS_LABELS } from '../utils';

export function ProjectSelectionRail({
  projects,
  selectedProjectId,
  defaultProjectId,
  onSelectProject,
}: ProjectSelectionRailProps) {
  return (
    <section className="workspace-page__project-browser">
      <div className="workspace-page__project-browser-header">
        <div>
          <div className="workspace-page__projects-eyebrow">Project Selection</div>
          <h3 className="workspace-page__project-browser-title">Workspace Projects</h3>
        </div>
        <p className="workspace-page__project-browser-copy workspace-page__project-browser-copy--left">
          Select a project to view or update its domains.
        </p>
      </div>

      <div className="workspace-page__project-selection-list">
        {projects.map((project) => {
          const isSelected = selectedProjectId === project.id;

          return (
            <button
              key={project.id}
              type="button"
              className={`workspace-page__project-strip-card ${isSelected ? 'workspace-page__project-strip-card--active' : ''}`}
              onClick={() => onSelectProject(project.id)}
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
                <span className="workspace-page__project-meta-value">{isSelected ? 'Current' : 'Available'}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}