import { Button, Textarea, TextInput } from '@library';
import { Users } from 'lucide-react';
import { FormSection } from '../../../components/FormSection';
import { ModalDialog } from '../../../components/ModalDialog';
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
}: {
  savingAction: string;
  onClose: () => void;
}) {
  return (
    <ModalDialog.Footer align="between" className="workspace-teams-page__modal-footer">
      <span className="workspace-teams-page__modal-hint">Ctrl/Cmd + Enter creates the team.</span>
      <ModalDialog.Actions className="workspace-teams-page__modal-actions">
        <Button type="button" variant="secondary" onClick={onClose} disabled={savingAction === 'create'}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="workspace-team-create-form"
          variant="primary"
          loading={savingAction === 'create'}
          disabled={savingAction === 'create'}
        >
          <span className="workspace-teams-page__modal-btn-icon">
            <Users size={14} />
          </span>
          <span>{savingAction === 'create' ? 'Creating...' : 'Create Team'}</span>
        </Button>
      </ModalDialog.Actions>
    </ModalDialog.Footer>
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
    <ModalDialog.Root
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      style={{ maxWidth: '500px' }}
    >
      <ModalDialog.Header
        title="Create New Team"
        description="Create a team to organize projects, cycles, labels, and work ownership."
      />

      <ModalDialog.Body>
        <FormSection.Root
          layout="none"
          id="workspace-team-create-form"
          aria-label="Create Team"
          className="workspace-teams-page__modal-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void onCreateTeam();
          }}
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

          <FormSection.Field className="workspace-teams-page__color-section" label="Team Color">
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
          </FormSection.Field>
        </FormSection.Root>
      </ModalDialog.Body>

      <CreateTeamCreateModalFooter
        savingAction={savingAction}
        onClose={onClose}
      />
    </ModalDialog.Root>
  );
}
