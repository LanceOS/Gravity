import { useOpenDialog } from '../../../hooks/useOpenDialog';

interface UseWorkspaceCreateProjectDialogArgs {
  setIsCreateProjectModalOpen: (open: boolean) => void;
}

interface UseWorkspaceCreateProjectDialogResult {
  handleOpenCreateProject: () => void;
}

export function useWorkspaceCreateProjectDialog({
  setIsCreateProjectModalOpen,
}: UseWorkspaceCreateProjectDialogArgs): UseWorkspaceCreateProjectDialogResult {
  const { open } = useOpenDialog({ setIsOpen: setIsCreateProjectModalOpen });
  const handleOpenCreateProject = open;

  return { handleOpenCreateProject };
}
