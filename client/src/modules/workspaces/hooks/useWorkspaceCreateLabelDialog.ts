import { useCallback } from 'react';

interface UseWorkspaceCreateLabelDialogArgs {
  setIsCreateLabelModalOpen: (open: boolean) => void;
}

interface UseWorkspaceCreateLabelDialogResult {
  handleOpenCreateLabel: () => void;
}

export function useWorkspaceCreateLabelDialog({
  setIsCreateLabelModalOpen,
}: UseWorkspaceCreateLabelDialogArgs): UseWorkspaceCreateLabelDialogResult {
  const handleOpenCreateLabel = useCallback(() => {
    setIsCreateLabelModalOpen(true);
  }, [setIsCreateLabelModalOpen]);

  return { handleOpenCreateLabel };
}
