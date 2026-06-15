import { Button, TextInput, Textarea } from '@library';
import { useWorkspaceProjectPanelActionsContext } from '../context/WorkspaceProjectPanelActionsContext';
import { useWorkspaceProjectPanelLabelStateContext } from '../context/WorkspaceProjectPanelLabelStateContextCore';

export interface WorkspaceProjectLabelCreateFormProps {
  isLabelBusy: boolean;
  labelCreateLoading: boolean;
}

export function WorkspaceProjectLabelCreateForm({
  isLabelBusy,
  labelCreateLoading,
}: WorkspaceProjectLabelCreateFormProps) {
  const { labelName, labelColor, labelDescription, setLabelName, setLabelColor, setLabelDescription } =
    useWorkspaceProjectPanelLabelStateContext();
  const { createLabel } = useWorkspaceProjectPanelActionsContext();

  return (
    <form className="workspace-page__domain-form" onSubmit={createLabel}>
      <TextInput
        label="Label Name"
        value={labelName}
        onChange={(event) => setLabelName(event.target.value)}
        placeholder="Frontend Platform"
        disabled={isLabelBusy}
        required
      />

      <div className="workspace-page__project-field workspace-page__project-field--compact">
        <span className="workspace-page__project-label">Color</span>
        <input
          type="color"
          className="workspace-page__project-color-input"
          value={labelColor}
          onChange={(event) => setLabelColor(event.target.value)}
          disabled={isLabelBusy}
          style={{ height: '36px', padding: '2px', cursor: 'pointer' }}
        />
      </div>

      <Textarea
        label="Description"
        value={labelDescription}
        onChange={(event) => setLabelDescription(event.target.value)}
        placeholder="What does this label represent?"
        rows={3}
        disabled={isLabelBusy}
        style={{ gridColumn: '1 / -1' }}
      />

      <div className="workspace-page__project-form-actions workspace-page__project-form-actions--inline" style={{ gridColumn: '1 / -1' }}>
        <Button
          type="submit"
          variant="primary"
          loading={labelCreateLoading}
          disabled={isLabelBusy || !labelName.trim()}
          style={{ minHeight: '36px' }}
        >
          Create Label
        </Button>
      </div>
    </form>
  );
}
