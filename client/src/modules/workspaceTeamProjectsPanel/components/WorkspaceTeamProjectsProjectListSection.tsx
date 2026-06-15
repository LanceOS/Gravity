import { PROJECT_STATUS_LABELS } from '../../workspaceProjectsPanel/utils/WorkspaceProjectPanel';
import type { Project } from '../../../types/domain';

interface WorkspaceTeamProjectsProjectListSectionProps {
  projects: Project[];
  selectedProjectId: string;
  teamName?: string | null;
  onSelectProject: (projectId: string) => void;
}

function WorkspaceTeamProjectsProjectCard({
  project,
  isSelected,
  onSelect,
}: {
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      key={project.id}
      type="button"
      className={
        isSelected
          ? 'workspace-team-projects-page__project-card workspace-team-projects-page__project-card--active'
          : 'workspace-team-projects-page__project-card'
      }
      onClick={onSelect}
    >
      <div className="workspace-team-projects-page__project-card-top">
        <span className="workspace-team-projects-page__project-key">{project.key}</span>
        <span className={`workspace-team-projects-page__project-status workspace-team-projects-page__project-status--${project.status}`}>
          {PROJECT_STATUS_LABELS[project.status]}
        </span>
      </div>

      <div className="workspace-team-projects-page__project-card-body">
        <div className="workspace-team-projects-page__project-name">{project.name}</div>
        <p>{project.description || 'No description added yet.'}</p>
      </div>

      <div className="workspace-team-projects-page__project-card-footer">
        <span>{project.githubRepoUrl ? 'GitHub linked' : 'No GitHub repo'}</span>
        <span>{isSelected ? 'Selected' : 'Click to edit'}</span>
      </div>
    </button>
  );
}

export function WorkspaceTeamProjectsProjectListSection({
  projects,
  selectedProjectId,
  teamName,
  onSelectProject,
}: WorkspaceTeamProjectsProjectListSectionProps) {
  return (
    <section className="workspace-team-projects-page__projects-card" aria-label="Team projects">
      <div className="workspace-team-projects-page__section-header">
        <div>
          <div className="workspace-team-projects-page__section-kicker">Project roster</div>
          <h3>{teamName ?? 'Team'} projects</h3>
        </div>
        <p>Pick a project to edit, or create a new one for this team.</p>
      </div>

      {projects.length === 0 ? (
        <div className="workspace-team-projects-page__empty">
          <div className="workspace-team-projects-page__empty-title">No projects in this team yet</div>
          <p>Use New Project to create the first project for {teamName ?? 'this team'}.</p>
        </div>
      ) : (
        <div className="workspace-team-projects-page__project-list">
          {projects.map((project) => {
            const isSelected = selectedProjectId === project.id;
            return (
              <WorkspaceTeamProjectsProjectCard
                key={project.id}
                project={project}
                isSelected={isSelected}
                onSelect={() => onSelectProject(project.id)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

