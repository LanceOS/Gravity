import { Users } from 'lucide-react';

interface WorkspaceTeamsHeroProps {
  workspaceName: string;
  teamCount: number;
}

export function WorkspaceTeamsHero({ workspaceName, teamCount }: WorkspaceTeamsHeroProps) {
  return (
    <section className="workspace-teams-page__hero">
      <div>
        <div className="workspace-teams-page__eyebrow">Team workspace</div>
        <div className="workspace-teams-page__hero-header">
          <h2>{workspaceName}</h2>
          <div className="workspace-teams-page__hero-meta">
            <span className="workspace-teams-page__hero-pill">{teamCount} teams</span>
            <span className="workspace-teams-page__hero-pill">{workspaceName}</span>
          </div>
        </div>
        <p className="workspace-teams-page__hero-description">
          Manage the teams that organize projects, cycles, labels, and aggregate task views in this workspace.
        </p>
      </div>
      <div className="workspace-teams-page__hero-stat">
        <Users size={18} />
        <span>{teamCount}</span>
        <small>{teamCount === 1 ? 'team' : 'teams'}</small>
      </div>
    </section>
  );
}
