import type { Label } from '../../../context/TicketContext';
import { WorkspaceProjectLabelEditor } from './WorkspaceProjectLabelEditor';
import { WorkspaceProjectLabelNoSelectionMessage } from './WorkspaceProjectLabelNoSelectionMessage';

export interface WorkspaceProjectLabelEditorSectionProps {
  activeLabel: Label | null;
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

export function WorkspaceProjectLabelEditorSection({
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
}: WorkspaceProjectLabelEditorSectionProps) {
  return activeLabel ? (
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
      onSaveLabel={onSaveLabel}
      onDeleteLabel={onDeleteLabel}
      onCancelEdit={onCancelEdit}
    />
  ) : (
    <WorkspaceProjectLabelNoSelectionMessage />
  );
}

