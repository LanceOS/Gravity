import { useOpenDialog } from '../../../hooks/useOpenDialog';

interface UseWorkspaceCreateLabelDialogArgs {
  setIsCreateLabelModalOpen: (open: boolean) => void;
}

interface UseWorkspaceCreateLabelDialogResult {
  handleOpenCreateLabel: () => void;
}

export function useWorkspaceCreateLabelDialog({
  setIsCreateLabelModalOpen,
}: UseWorkspaceCreateLabelDialogArgs): UseWorkspaceCreateLabelDialogResult {
  const { open } = useOpenDialog({ setIsOpen: setIsCreateLabelModalOpen });
  const handleOpenCreateLabel = open;

  return { handleOpenCreateLabel };
}
