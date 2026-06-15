import { useCallback } from 'react';

interface UseWorkspaceCreateProjectDialogArgs {
  setIsCreateProjectModalOpen: (open: boolean) => void;
}

interface UseWorkspaceCreateProjectDialogResult {
  handleOpenCreateProject: () => void;
}

export function useWorkspaceCreateProjectDialog({
  setIsCreateProjectModalOpen,
}: UseWorkspaceCreateProjectDialogArgs): UseWorkspaceCreateProjectDialogResult {
  const handleOpenCreateProject = useCallback(() => {
    setIsCreateProjectModalOpen(true);
  }, [setIsCreateProjectModalOpen]);

  return { handleOpenCreateProject };
}
