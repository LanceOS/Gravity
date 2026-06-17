import { Button, CircularColorInput, TextInput, Textarea } from '@library';
import { FormSection } from '../../../components/FormSection';
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
    <FormSection.Root layout="none" className="workspace-page__domain-form" onSubmit={createLabel}>
      <TextInput
        label="Label Name"
        value={labelName}
        onChange={(event) => setLabelName(event.target.value)}
        placeholder="Frontend Platform"
        disabled={isLabelBusy}
        required
      />

      <CircularColorInput
        className="workspace-page__project-field workspace-page__project-field--compact"
        inputClassName="workspace-page__project-color-input"
        labelClassName="workspace-page__project-label"
        label="Color"
        value={labelColor}
        onChange={(event) => setLabelColor(event.target.value)}
        disabled={isLabelBusy}
      />

      <Textarea
        label="Description"
        value={labelDescription}
        onChange={(event) => setLabelDescription(event.target.value)}
        placeholder="What does this label represent?"
        rows={3}
        disabled={isLabelBusy}
        style={{ gridColumn: '1 / -1' }}
      />

      <FormSection.Actions className="workspace-page__project-form-actions workspace-page__project-form-actions--inline" style={{ gridColumn: '1 / -1' }}>
        <Button
          type="submit"
          variant="primary"
          loading={labelCreateLoading}
          disabled={isLabelBusy || !labelName.trim()}
          style={{ minHeight: '36px' }}
        >
          Create Label
        </Button>
      </FormSection.Actions>
    </FormSection.Root>
  );
}
