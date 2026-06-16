import { useMemo } from 'react';
import { ChevronRight, Database } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PROJECT_STATUS_LABELS } from '../../workspaces';
import type { Project } from '../../../context/TicketContext';
import { useTickets } from '../../../context/TicketContext';
import { WorkspacePageLayout } from '../../../layouts/WorkspacePageLayout/WorkspacePageLayout';
import '../styles/WorkspaceProjectsListPage.css';

function getProjectTargetPath(workspaceId: string, project: Project) {
  const projectWorkspaceId = project.workspaceId || workspaceId;
  if (project.teamId) {
    return `/workspaces/${projectWorkspaceId}/teams/${project.teamId}/projects/${project.id}/tickets`;
  }

  return `/workspaces/${projectWorkspaceId}/projects/${project.id}/tickets`;
}

export function WorkspaceProjectsListPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const { activeProjectId, projects } = useTickets();

  const workspaceProjects = useMemo(() => {
    if (!workspaceId) {
      return [];
    }

    return projects
      .filter((project) => project.workspaceId === workspaceId)
      .slice()
      .sort((first, second) => first.name.localeCompare(second.name) || first.key.localeCompare(second.key));
  }, [projects, workspaceId]);
  const projectCountLabel = `${workspaceProjects.length} project${workspaceProjects.length === 1 ? '' : 's'}`;

  const handleSelectProject = (project: Project) => {
    if (!workspaceId) {
      return;
    }

    navigate(getProjectTargetPath(workspaceId, project));
  };

  return (
    <WorkspacePageLayout
      pageClassName="workspace-projects-list-page"
      title="Workspace Projects"
      actions={
        <div className="workspace-projects-list-page__count" aria-label={projectCountLabel}>
          {projectCountLabel}
        </div>
      }
      contentHeader={
        <div className="workspace-projects-list-page__header">
          <div>
            <div className="workspace-projects-list-page__eyebrow">Workspace</div>
            <p className="workspace-projects-list-page__subtitle">
              Browse every project in the active workspace and jump straight into its board.
            </p>
          </div>
        </div>
      }
      contentBodyClassName="workspace-projects-list-page__table"
    >
      <div className="workspace-projects-list-page__table-header" aria-hidden="true">
        <span>Project</span>
        <span>Status</span>
      </div>

      {workspaceProjects.length > 0 ? (
        <div className="workspace-projects-list-page__rows">
          {workspaceProjects.map((project) => {
            const isActive = project.id === activeProjectId;

            return (
              <button
                key={project.id}
                type="button"
                className={`workspace-projects-list-page__row ${
                  isActive ? 'workspace-projects-list-page__row--active' : ''
                }`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleSelectProject(project)}
              >
                <div className="workspace-projects-list-page__project-copy">
                  <div className="workspace-projects-list-page__project-title-row">
                    <span className="workspace-projects-list-page__project-title">{project.name}</span>
                    <span className="workspace-projects-list-page__project-key">{project.key}</span>
                  </div>
                  <p className="workspace-projects-list-page__project-description">
                    {project.description || 'No description added yet.'}
                  </p>
                </div>

                <div className="workspace-projects-list-page__project-meta">
                  <span
                    className={`workspace-projects-list-page__project-status workspace-projects-list-page__project-status--${project.status}`}
                  >
                    {PROJECT_STATUS_LABELS[project.status]}
                  </span>
                  <span className="workspace-projects-list-page__project-chevron" aria-hidden="true">
                    <ChevronRight size={14} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="workspace-projects-list-page__empty">
          <Database className="workspace-projects-list-page__empty-icon" size={24} />
          <div className="workspace-projects-list-page__empty-title">No projects in this workspace yet</div>
          <div className="workspace-projects-list-page__empty-copy">
            Create a project from the project manager to start organizing work.
          </div>
        </div>
      )}
    </WorkspacePageLayout>
  );
}
