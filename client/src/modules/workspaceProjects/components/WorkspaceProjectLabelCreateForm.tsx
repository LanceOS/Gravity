import { Button, TextInput, Textarea } from '@library';

export interface WorkspaceProjectLabelCreateFormProps {
  labelName: string;
  labelColor: string;
  labelDescription: string;
  isLabelBusy: boolean;
  labelCreateLoading: boolean;
  onLabelNameChange: (name: string) => void;
  onLabelColorChange: (color: string) => void;
  onLabelDescriptionChange: (description: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function WorkspaceProjectLabelCreateForm({
  labelName,
  labelColor,
  labelDescription,
  isLabelBusy,
  labelCreateLoading,
  onLabelNameChange,
  onLabelColorChange,
  onLabelDescriptionChange,
  onSubmit,
}: WorkspaceProjectLabelCreateFormProps) {
  return (
    <form className="workspace-page__domain-form" onSubmit={onSubmit}>
      <TextInput
        label="Label Name"
        value={labelName}
        onChange={(event) => onLabelNameChange(event.target.value)}
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
          onChange={(event) => onLabelColorChange(event.target.value)}
          disabled={isLabelBusy}
          style={{ height: '36px', padding: '2px', cursor: 'pointer' }}
        />
      </div>

      <Textarea
        label="Description"
        value={labelDescription}
        onChange={(event) => onLabelDescriptionChange(event.target.value)}
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
