import { CalendarDays, FolderKanban, Tags } from 'lucide-react';
import type { SidebarTeam } from '../../../types/domain';
import { DEFAULT_TEAM_COLOR } from '../utils/WorkspaceTeamsPage';

interface WorkspaceTeamsTeamListSectionProps {
  teams: SidebarTeam[];
  selectedTeamId: string;
  onSelectTeam: (teamId: string) => void;
}

export function WorkspaceTeamsTeamListSection({ teams, selectedTeamId, onSelectTeam }: WorkspaceTeamsTeamListSectionProps) {
  return (
    <section className="workspace-teams-page__teams-card" aria-label="Teams roster">
      <div className="workspace-teams-page__section-header">
        <div>
          <div className="workspace-teams-page__section-kicker">Team roster</div>
          <h3>Workspace teams</h3>
        </div>
        <p>Pick a team to edit or view its projects, or create a new one.</p>
      </div>

      {teams.length === 0 ? (
        <div className="workspace-teams-page__empty">
          <div className="workspace-teams-page__empty-title">No teams in this workspace yet</div>
          <p>Create your first team to get started.</p>
        </div>
      ) : (
        <div className="workspace-teams-page__team-list">
          {teams.map((team) => {
            const isSelected = selectedTeamId === team.id;
            return (
              <button
                key={team.id}
                type="button"
                className={
                  isSelected
                    ? 'workspace-teams-page__team-card-item workspace-teams-page__team-card-item--active'
                    : 'workspace-teams-page__team-card-item'
                }
                onClick={() => onSelectTeam(team.id)}
              >
                <div className="workspace-teams-page__team-card-item-top">
                  <span
                    className="workspace-teams-page__team-color"
                    style={{ background: team.color || DEFAULT_TEAM_COLOR }}
                  />
                  <span className="workspace-teams-page__team-name">{team.name}</span>
                </div>

                <div className="workspace-teams-page__team-card-item-body">
                  <p>{team.description || 'No description added yet.'}</p>
                </div>

                <div className="workspace-teams-page__team-card-item-footer">
                  <div className="workspace-teams-page__team-metrics">
                    <span>
                      <FolderKanban size={11} />
                      {team.projects?.length ?? 0}
                    </span>
                    <span>
                      <CalendarDays size={11} />
                      {team.cycles?.length ?? 0}
                    </span>
                    <span>
                      <Tags size={11} />
                      {(team.labels ?? []).length}
                    </span>
                  </div>
                  <span className="workspace-teams-page__team-card-item-action-text">
                    {isSelected ? 'Selected' : 'Click to edit'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
