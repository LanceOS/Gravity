import { ConfirmDialog } from '../../../components/ConfirmDialog';

interface WorkspaceProjectDeleteModalProps {
  isOpen: boolean;
  projectName: string;
  onClose: () => void;
  onConfirmDelete: () => void | Promise<void>;
}

export function WorkspaceProjectDeleteModal({
  isOpen,
  projectName,
  onClose,
  onConfirmDelete,
}: WorkspaceProjectDeleteModalProps) {
  return (
    <ConfirmDialog.Root isOpen={isOpen} onClose={onClose}>
      <ConfirmDialog.Header title="Delete Project" description="This action is permanent." />
      <ConfirmDialog.Body>
        <p>
          Are you sure you want to delete the project <strong>{projectName}</strong>?
        </p>
        <p>This action is permanent and will delete all associated tickets and comments.</p>
      </ConfirmDialog.Body>
      <ConfirmDialog.Actions
        cancelLabel="Cancel"
        confirmLabel="Delete Project"
        onCancel={onClose}
        onConfirm={onConfirmDelete}
      />
    </ConfirmDialog.Root>
  );
}
