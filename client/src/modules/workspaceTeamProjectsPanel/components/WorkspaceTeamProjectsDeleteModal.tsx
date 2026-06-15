import { Button, Modal } from '@library';

interface WorkspaceTeamProjectsDeleteModalProps {
  isOpen: boolean;
  projectName: string;
  onClose: () => void;
  onConfirmDelete: () => void;
}

export function WorkspaceTeamProjectsDeleteModal({
  isOpen,
  projectName,
  onClose,
  onConfirmDelete,
}: WorkspaceTeamProjectsDeleteModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Project">
      <div style={{ padding: '16px 20px', color: 'var(--color-text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
        <p>
          Are you sure you want to delete the project <strong>{projectName}</strong>?
        </p>
        <p style={{ marginTop: 8 }}>
          This action is permanent and will delete all associated tickets and comments.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirmDelete}>
            Delete Project
          </Button>
        </div>
      </div>
    </Modal>
  );
}

