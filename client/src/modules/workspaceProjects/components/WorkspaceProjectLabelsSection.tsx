import type { Label } from '../../../context/TicketContext';

import { WorkspaceProjectLabelCreateForm } from './WorkspaceProjectLabelCreateForm';
import { WorkspaceProjectLabelEditor } from './WorkspaceProjectLabelEditor';
import { WorkspaceProjectLabelList } from './WorkspaceProjectLabelList';

interface WorkspaceProjectLabelsSectionProps {
  managedProjectName: string;
  labels: Label[];
  labelFormError: string | null;
  labelCreateError: string | null;
  isLabelBusy: boolean;
  labelCreateLoading: boolean;
  editingLabelLoading: boolean;
  editingLabelError: string | null;
  activeLabel: Label | null;
  labelName: string;
  labelColor: string;
  labelDescription: string;
  editingLabelId: string | null;
  editingLabelName: string;
  editingLabelColor: string;
  editingLabelDescription: string;
  onLabelNameChange: (name: string) => void;
  onLabelColorChange: (color: string) => void;
  onLabelDescriptionChange: (description: string) => void;
  onCreateLabel: (event: React.FormEvent<HTMLFormElement>) => void;
  onStartEditingLabel: (label: Label) => void;
  onEditingLabelNameChange: (name: string) => void;
  onEditingLabelColorChange: (color: string) => void;
  onEditingLabelDescriptionChange: (description: string) => void;
  onUpdateLabel: (event: React.FormEvent<HTMLFormElement>) => void;
  onDeleteLabel: () => void;
  onClearLabelEditor: () => void;
}

export function WorkspaceProjectLabelsSection({
  managedProjectName,
  labels,
  labelFormError,
  labelCreateError,
  isLabelBusy,
  labelCreateLoading,
  editingLabelLoading,
  activeLabel,
  editingLabelError,
  labelName,
  labelColor,
  labelDescription,
  editingLabelId,
  editingLabelName,
  editingLabelColor,
  editingLabelDescription,
  onLabelNameChange,
  onLabelColorChange,
  onLabelDescriptionChange,
  onCreateLabel,
  onStartEditingLabel,
  onEditingLabelNameChange,
  onEditingLabelColorChange,
  onEditingLabelDescriptionChange,
  onUpdateLabel,
  onDeleteLabel,
  onClearLabelEditor,
}: WorkspaceProjectLabelsSectionProps) {
  return (
    <section className="workspace-page__project-domains">
      <div className="workspace-page__project-domain-header">
        <div>
          <div className="workspace-page__projects-eyebrow">Project Labels</div>
          <h3 className="workspace-page__project-manager-title">{managedProjectName} labels</h3>
        </div>
        <p className="workspace-page__project-browser-copy workspace-page__project-browser-copy--left">
          Use labels for ticket assignment and list sorting.
        </p>
      </div>

      {labelFormError || labelCreateError ? (
        <div className="workspace-page__project-feedback workspace-page__project-feedback--error">{labelFormError || labelCreateError}</div>
      ) : null}

      <WorkspaceProjectLabelList
        labels={labels}
        activeLabelId={editingLabelId}
        onSelectLabel={onStartEditingLabel}
        managedProjectName={managedProjectName}
      />

      {activeLabel ? (
        <WorkspaceProjectLabelEditor
          activeLabel={activeLabel}
          editingLabelName={editingLabelName}
          editingLabelColor={editingLabelColor}
          editingLabelDescription={editingLabelDescription}
          isLabelBusy={isLabelBusy}
          editingLabelLoading={editingLabelLoading}
          editingLabelError={editingLabelError}
          onEditingLabelNameChange={onEditingLabelNameChange}
          onEditingLabelColorChange={onEditingLabelColorChange}
          onEditingLabelDescriptionChange={onEditingLabelDescriptionChange}
          onSaveLabel={onUpdateLabel}
          onDeleteLabel={onDeleteLabel}
          onCancelEdit={onClearLabelEditor}
        />
      ) : (
        <div className="workspace-page__domain-empty">Select a label to edit its name, color, description, or delete it.</div>
      )}

      <WorkspaceProjectLabelCreateForm
        labelName={labelName}
        labelColor={labelColor}
        labelDescription={labelDescription}
        isLabelBusy={isLabelBusy}
        labelCreateLoading={labelCreateLoading}
        onLabelNameChange={onLabelNameChange}
        onLabelColorChange={onLabelColorChange}
        onLabelDescriptionChange={onLabelDescriptionChange}
        onSubmit={onCreateLabel}
      />
    </section>
  );
}
