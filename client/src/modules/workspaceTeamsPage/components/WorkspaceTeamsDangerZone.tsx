import { Button, Select } from '@library';
import type { SidebarTeam } from '../../../types/domain';
import { getTeamReferenceCount } from '../utils/WorkspaceTeamsPage';

interface WorkspaceTeamsDangerZoneProps {
  selectedTeam: SidebarTeam;
  sortedTeams: SidebarTeam[];
  reassignTeamById: Record<string, string>;
  savingAction: string;
  onReassignChange?: (teamId: string, reassignId: string) => void;
  onDelete: (team: SidebarTeam) => void;
}

export function WorkspaceTeamsDangerZone({
  selectedTeam,
  sortedTeams,
  reassignTeamById,
  savingAction,
  onReassignChange,
  onDelete,
}: WorkspaceTeamsDangerZoneProps) {
  const referenceCount = getTeamReferenceCount(selectedTeam);
  const handleReassignChange = onReassignChange ?? (() => undefined);
  const reassignOptions = sortedTeams.filter((candidate) => candidate.id !== selectedTeam.id);
  const selectedReassignTeamId = reassignTeamById[selectedTeam.id] ?? '';
  const showReassignField = referenceCount > 0 && reassignOptions.length > 0;
  const showLastTeamWarning = referenceCount > 0 && reassignOptions.length === 0;
  const deleteDisabled = referenceCount > 0 && reassignOptions.length > 0 && !selectedReassignTeamId;

  return (
    <>
      {showReassignField ? (
        <div className="workspace-teams-page__reassign-field">
          <span id={`${selectedTeam.id}-reassign-label`} className="workspace-teams-page__reassign-label">
            Reassign owned work before delete
          </span>
          <Select
            aria-labelledby={`${selectedTeam.id}-reassign-label`}
            className="workspace-teams-page__reassign-select workspace-teams-page__reassign-select--full"
            value={selectedReassignTeamId}
            placeholder="Choose a team"
            options={reassignOptions.map((candidate) => ({
              value: candidate.id,
              label: candidate.name,
              color: candidate.color,
            }))}
            onValueChange={(nextTeamId) => handleReassignChange(selectedTeam.id, nextTeamId)}
          />
        </div>
      ) : null}

      {showLastTeamWarning ? (
        <div className="workspace-teams-page__danger-note">
          This is the last team in the workspace. Deleting it will permanently remove its projects and related work.
        </div>
      ) : null}

      <div className="workspace-teams-page__danger-delete-row">
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={() => onDelete(selectedTeam)}
          disabled={deleteDisabled || savingAction === `delete:${selectedTeam.id}`}
        >
          <span>{savingAction === `delete:${selectedTeam.id}` ? 'Deleting...' : 'Delete Team'}</span>
        </Button>
      </div>
    </>
  );
}
