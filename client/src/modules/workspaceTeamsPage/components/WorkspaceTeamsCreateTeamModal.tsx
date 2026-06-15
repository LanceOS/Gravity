import { Button, Modal, Textarea, TextInput } from '@library';
import { Users } from 'lucide-react';
import type { TeamDraft } from '../types/WorkspaceTeamsPage';
import { COLOR_OPTIONS } from '../utils/WorkspaceTeamsPage';

interface WorkspaceTeamsCreateTeamModalProps {
  isOpen: boolean;
  savingAction: string;
  createDraft: TeamDraft;
  onClose: () => void;
  onDraftChange: (next: (draft: TeamDraft) => TeamDraft) => void;
  onCreateTeam: () => Promise<void> | void;
}

function CreateTeamCreateModalFooter({
  savingAction,
  onClose,
  onCreateTeam,
}: {
  savingAction: string;
  onClose: () => void;
  onCreateTeam: () => Promise<void> | void;
}) {
  return (
    <div className="workspace-teams-page__modal-footer">
      <span className="workspace-teams-page__modal-hint">Ctrl/Cmd + Enter creates the team.</span>
      <div className="workspace-teams-page__modal-actions">
        <Button type="button" variant="secondary" onClick={onClose} disabled={savingAction === 'create'}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={onCreateTeam} disabled={savingAction === 'create'}>
          <span className="workspace-teams-page__modal-btn-icon">
            <Users size={14} />
          </span>
          <span>{savingAction === 'create' ? 'Creating...' : 'Create Team'}</span>
        </Button>
      </div>
    </div>
  );
}

export function WorkspaceTeamsCreateTeamModal({
  isOpen,
  savingAction,
  createDraft,
  onClose,
  onDraftChange,
  onCreateTeam,
}: WorkspaceTeamsCreateTeamModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Create New Team"
      footer={
        <CreateTeamCreateModalFooter
          savingAction={savingAction}
          onClose={onClose}
          onCreateTeam={onCreateTeam}
        />
      }
      style={{ maxWidth: '500px' }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreateTeam();
        }}
        className="workspace-teams-page__modal-form"
      >
        <TextInput
          label="Team Name"
          placeholder="Engineering"
          value={createDraft.name}
          onChange={(event) => onDraftChange((draft) => ({ ...draft, name: event.target.value }))}
          autoFocus
          required
          disabled={savingAction === 'create'}
        />

        <Textarea
          label="Description"
          placeholder="Owns product delivery and platform work"
          value={createDraft.description}
          onChange={(event) => onDraftChange((draft) => ({ ...draft, description: event.target.value }))}
          rows={4}
          disabled={savingAction === 'create'}
        />

        <div className="workspace-teams-page__color-section">
          <span className="workspace-teams-page__color-label">Team Color</span>
          <div className="workspace-teams-page__color-row" aria-label="Team color">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use team color ${color}`}
                className={
                  createDraft.color === color
                    ? 'workspace-teams-page__color-swatch workspace-teams-page__color-swatch--active'
                    : 'workspace-teams-page__color-swatch'
                }
                style={{ background: color }}
                onClick={() => onDraftChange((draft) => ({ ...draft, color }))}
              />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
