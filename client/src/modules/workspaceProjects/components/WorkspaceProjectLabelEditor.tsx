import { Button, TextInput, Textarea } from '@library';
import { PencilLine, Trash2 } from 'lucide-react';

import type { Label } from '../../../context/TicketContext';

export interface WorkspaceProjectLabelEditorProps {
  activeLabel: Label;
  editingLabelName: string;
  editingLabelColor: string;
  editingLabelDescription: string;
  isLabelBusy: boolean;
  editingLabelLoading: boolean;
  editingLabelError: string | null;
  onEditingLabelNameChange: (name: string) => void;
  onEditingLabelColorChange: (color: string) => void;
  onEditingLabelDescriptionChange: (description: string) => void;
  onSaveLabel: (event: React.FormEvent<HTMLFormElement>) => void;
  onDeleteLabel: () => void;
  onCancelEdit: () => void;
}

export function WorkspaceProjectLabelEditor({
  activeLabel,
  editingLabelName,
  editingLabelColor,
  editingLabelDescription,
  isLabelBusy,
  editingLabelLoading,
  editingLabelError,
  onEditingLabelNameChange,
  onEditingLabelColorChange,
  onEditingLabelDescriptionChange,
  onSaveLabel,
  onDeleteLabel,
  onCancelEdit,
}: WorkspaceProjectLabelEditorProps) {
  return (
    <section className="workspace-page__label-editor">
      <div className="workspace-page__project-domain-header">
        <div>
          <div className="workspace-page__projects-eyebrow">Edit Label</div>
          <h3 className="workspace-page__project-manager-title">{activeLabel.name}</h3>
        </div>
        <p className="workspace-page__project-browser-copy workspace-page__project-browser-copy--left">
          Update the label name, color, or description. Delete removes it from every ticket.
        </p>
      </div>

      {editingLabelError ? (
        <div className="workspace-page__project-feedback workspace-page__project-feedback--error">{editingLabelError}</div>
      ) : null}

      <form className="workspace-page__label-editor-form" onSubmit={onSaveLabel}>
        <div className="workspace-page__label-editor-grid">
          <TextInput
            label="Label Name"
            value={editingLabelName}
            onChange={(event) => onEditingLabelNameChange(event.target.value)}
            placeholder="Frontend Platform"
            disabled={isLabelBusy}
            required
          />

          <div className="workspace-page__project-field workspace-page__project-field--compact">
            <span className="workspace-page__project-label">Color</span>
            <input
              type="color"
              className="workspace-page__project-color-input"
              value={editingLabelColor}
              onChange={(event) => onEditingLabelColorChange(event.target.value)}
              disabled={isLabelBusy}
              style={{ height: '36px', padding: '2px', cursor: 'pointer' }}
            />
          </div>
        </div>

        <Textarea
          label="Description"
          value={editingLabelDescription}
          onChange={(event) => onEditingLabelDescriptionChange(event.target.value)}
          placeholder="Explain when this label should be used."
          rows={3}
          disabled={isLabelBusy}
          style={{ gridColumn: '1 / -1' }}
        />

        <div className="workspace-page__label-editor-actions" style={{ gridColumn: '1 / -1' }}>
          <Button
            type="submit"
            variant="primary"
            loading={editingLabelLoading}
            disabled={isLabelBusy || !editingLabelName.trim()}
          >
            <PencilLine size={14} />
            <span>Save Label</span>
          </Button>

          <Button
            type="button"
            variant="danger"
            loading={editingLabelLoading}
            disabled={isLabelBusy}
            onClick={onDeleteLabel}
          >
            <Trash2 size={14} />
            <span>Delete Label</span>
          </Button>

          <Button type="button" variant="secondary" disabled={isLabelBusy} onClick={onCancelEdit}>
            <span>Cancel</span>
          </Button>
        </div>
      </form>
    </section>
  );
}
