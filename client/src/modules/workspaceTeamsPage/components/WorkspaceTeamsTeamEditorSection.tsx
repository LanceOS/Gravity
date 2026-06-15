import { FolderKanban, Save } from 'lucide-react';
import { Button, Textarea, TextInput } from '@library';
import type { SidebarTeam } from '../../../types/domain';
import type { TeamDraft } from '../types/WorkspaceTeamsPage';
import { COLOR_OPTIONS } from '../utils/WorkspaceTeamsPage';
import { WorkspaceTeamsDangerZone } from './WorkspaceTeamsDangerZone';

interface WorkspaceTeamsTeamEditorSectionProps {
  selectedTeam: SidebarTeam | null;
  editDraft: TeamDraft;
  savingAction: string;
  sortedTeams: SidebarTeam[];
  reassignTeamById: Record<string, string>;
  onSave: (teamId: string) => void;
  onDraftChange: (next: (draft: TeamDraft) => TeamDraft) => void;
  onReassignChange: (teamId: string, reassignId: string) => void;
  onDelete: (team: SidebarTeam) => void;
  onManageProjects?: (teamId: string) => void;
}

export function WorkspaceTeamsTeamEditorSection({
  selectedTeam,
  editDraft,
  savingAction,
  sortedTeams,
  reassignTeamById,
  onSave,
  onDraftChange,
  onReassignChange,
  onDelete,
  onManageProjects,
}: WorkspaceTeamsTeamEditorSectionProps) {
  if (!selectedTeam) {
    return (
      <section className="workspace-teams-page__editor-card" aria-label="Team editor">
        <div className="workspace-teams-page__empty">
          <div className="workspace-teams-page__empty-title">No team selected</div>
          <p>Select a team from the roster to view or edit details.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-teams-page__editor-card" aria-label="Team editor">
      <div className="workspace-teams-page__section-header">
        <div>
          <div className="workspace-teams-page__section-kicker">Team editor</div>
          <h3>{selectedTeam.name} Details</h3>
        </div>
        <p>Update team name, description, color, or view its assigned projects.</p>
      </div>

      <form
        className="workspace-teams-page__form"
        aria-label="Team editor"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(selectedTeam.id);
        }}
      >
        <div className="workspace-teams-page__form-grid">
          <div className="workspace-teams-page__form-main">
            <TextInput
              label="Team Name"
              aria-label="Team name"
              value={editDraft.name}
              onChange={(event) => onDraftChange((draft) => ({ ...draft, name: event.target.value }))}
              placeholder="Engineering"
              required
            />

            <Textarea
              label="Description"
              aria-label="Team description"
              value={editDraft.description}
              onChange={(event) => onDraftChange((draft) => ({ ...draft, description: event.target.value }))}
              placeholder="Describe this team&apos;s ownership"
              className="workspace-teams-page__description-field"
              autoGrow={false}
              inputStyle={{ resize: 'none' }}
            />
          </div>

          <div className="workspace-teams-page__form-sidebar">
            <div className="workspace-teams-page__color-section">
              <span className="workspace-teams-page__color-label">Team Color</span>
              <div className="workspace-teams-page__color-row" aria-label="Edit team color">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use team color ${color}`}
                    className={
                      editDraft.color === color
                        ? 'workspace-teams-page__color-swatch workspace-teams-page__color-swatch--active'
                        : 'workspace-teams-page__color-swatch'
                    }
                    style={{ background: color }}
                    onClick={() => onDraftChange((draft) => ({ ...draft, color }))}
                  />
                ))}
              </div>
            </div>

            <div className="workspace-teams-page__projects-section">
              <span className="workspace-teams-page__projects-label">Projects</span>
              <div className="workspace-teams-page__project-list">
                {(selectedTeam.projects?.length ?? 0) > 0 ? (
                  selectedTeam.projects?.map((project) => (
                    <span key={project.id} className="workspace-teams-page__project-pill">
                      {project.key} · {project.name}
                    </span>
                  ))
                ) : (
                  <span className="workspace-teams-page__muted">No projects assigned yet.</span>
                )}
              </div>
              {onManageProjects ? (
                <div className="workspace-teams-page__manage-projects-btn">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onManageProjects(selectedTeam.id)}>
                    <FolderKanban size={13} />
                    <span>Manage Projects</span>
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="workspace-teams-page__meta-section">
              <span className="workspace-teams-page__meta-label">Team Stats</span>
              <div className="workspace-teams-page__meta">
                <span className="workspace-teams-page__meta-pill">Cycles: {selectedTeam.cycles?.length ?? 0}</span>
                <span className="workspace-teams-page__meta-pill">Labels: {(selectedTeam.labels ?? []).length}</span>
              </div>
            </div>

            <div className="workspace-teams-page__danger-zone-wrapper">
              <span className="workspace-teams-page__danger-zone-title">Danger Zone</span>
              <div className="workspace-teams-page__danger-zone-content">
                <WorkspaceTeamsDangerZone
                  selectedTeam={selectedTeam}
                  sortedTeams={sortedTeams}
                  reassignTeamById={reassignTeamById}
                  savingAction={savingAction}
                  onReassignChange={onReassignChange}
                  onDelete={onDelete}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="workspace-teams-page__actions-row">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={savingAction === `update:${selectedTeam.id}`}
          >
            <Save size={13} />
            <span>{savingAction === `update:${selectedTeam.id}` ? 'Saving...' : 'Save Team'}</span>
          </Button>
        </div>
      </form>
    </section>
  );
}
