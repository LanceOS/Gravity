import { Button, CircularColorInput, TextInput, Textarea } from '@library';
import { PencilLine, Trash2 } from 'lucide-react';

import { FormSection } from '../../../components/FormSection';
import { useWorkspaceProjectPanelActionsContext } from '../context/WorkspaceProjectPanelActionsContext';
import { useWorkspaceProjectPanelLabelStateContext } from '../context/WorkspaceProjectPanelLabelStateContextCore';

export interface WorkspaceProjectLabelEditorProps {
  isLabelBusy: boolean;
  editingLabelLoading: boolean;
}

export function WorkspaceProjectLabelEditor({
  isLabelBusy,
  editingLabelLoading,
}: WorkspaceProjectLabelEditorProps) {
  const {
    activeLabel,
    editingLabelName,
    editingLabelColor,
    editingLabelDescription,
    editingLabelError,
    setEditingLabelName,
    setEditingLabelColor,
    setEditingLabelDescription,
    clearLabelEditor,
  } = useWorkspaceProjectPanelLabelStateContext();
  const { updateLabel, deleteLabel } = useWorkspaceProjectPanelActionsContext();

  if (!activeLabel) {
    return null;
  }

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

      <FormSection.Root layout="none" className="workspace-page__label-editor-form" onSubmit={updateLabel}>
        <TextInput
          label="Label Name"
          value={editingLabelName}
          onChange={(event) => setEditingLabelName(event.target.value)}
          placeholder="Frontend Platform"
          disabled={isLabelBusy}
          required
        />

        <CircularColorInput
          className="workspace-page__project-field workspace-page__project-field--compact"
          inputClassName="workspace-page__project-color-input"
          labelClassName="workspace-page__project-label"
          label="Color"
          value={editingLabelColor}
        onChange={(event) => setEditingLabelColor(event.target.value)}
        disabled={isLabelBusy}
      />

        <Textarea
          label="Description"
          value={editingLabelDescription}
          onChange={(event) => setEditingLabelDescription(event.target.value)}
          placeholder="Explain when this label should be used."
          rows={3}
          disabled={isLabelBusy}
          style={{ gridColumn: '1 / -1' }}
        />

        <FormSection.Actions className="workspace-page__label-editor-actions" style={{ gridColumn: '1 / -1' }}>
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
            onClick={deleteLabel}
          >
            <Trash2 size={14} />
            <span>Delete Label</span>
          </Button>

          <Button type="button" variant="secondary" disabled={isLabelBusy} onClick={clearLabelEditor}>
            <span>Cancel</span>
          </Button>
        </FormSection.Actions>
      </FormSection.Root>
    </section>
  );
}
