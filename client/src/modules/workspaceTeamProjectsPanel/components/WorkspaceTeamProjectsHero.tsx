import { FolderKanban } from 'lucide-react';

interface WorkspaceTeamProjectsHeroProps {
  teamName?: string;
  teamDescription?: string | null;
  workspaceName: string;
  projectCount: number;
}

export function WorkspaceTeamProjectsHero({
  teamName,
  teamDescription,
  workspaceName,
  projectCount,
}: WorkspaceTeamProjectsHeroProps) {
  return (
    <section className="workspace-team-projects-page__hero">
      <div>
        <div className="workspace-team-projects-page__eyebrow">Team projects</div>
        <div className="workspace-team-projects-page__hero-header">
          <h2>{teamName ?? 'Loading team...'}</h2>
          <div className="workspace-team-projects-page__hero-meta">
            <span className="workspace-team-projects-page__hero-pill">{projectCount} projects</span>
            <span className="workspace-team-projects-page__hero-pill">{workspaceName}</span>
          </div>
        </div>
        <p className="workspace-team-projects-page__hero-description">
          {teamDescription || 'Create and refine the projects owned by this team without leaving team management.'}
        </p>
      </div>

      <div className="workspace-team-projects-page__hero-stat">
        <FolderKanban size={18} />
        <span>{projectCount}</span>
        <small>{projectCount === 1 ? 'project' : 'projects'}</small>
      </div>
    </section>
  );
}

