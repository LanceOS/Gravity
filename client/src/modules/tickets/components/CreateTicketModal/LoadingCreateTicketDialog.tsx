import { ModalDialog } from '../../../../components/ModalDialog';

/** Preserve dialog focus and Escape behavior while the create form chunk downloads. */
export function LoadingCreateTicketDialog({ onClose }: { onClose: () => void }) {
  return (
    <ModalDialog.Root ariaLabel="Loading ticket editor" isOpen onClose={onClose} size="sm">
      <ModalDialog.Body>
        <p role="status">Loading ticket editor...</p>
        <button type="button" onClick={onClose}>Cancel</button>
      </ModalDialog.Body>
    </ModalDialog.Root>
  );
}
