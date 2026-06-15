import { useCallback } from 'react';

import type { Ticket } from '../../../context/TicketContext';

interface UseWorkspaceCreateTicketDialogArgs {
  hasActiveWorkspaceProjects: boolean;
  setCreateInitialStatus: (status: Ticket['status'] | undefined) => void;
  setCreateParentId: (parentId: string | undefined) => void;
  setIsCreateModalOpen: (open: boolean) => void;
}

interface UseWorkspaceCreateTicketDialogResult {
  handleOpenCreateTicket: (initialStatus?: Ticket['status']) => void;
  handleOpenCreateSubtask: (parentId: string) => void;
}

export function useWorkspaceCreateTicketDialog({
  hasActiveWorkspaceProjects,
  setCreateInitialStatus,
  setCreateParentId,
  setIsCreateModalOpen,
}: UseWorkspaceCreateTicketDialogArgs): UseWorkspaceCreateTicketDialogResult {
  const handleOpenCreateTicket = useCallback(
    (initialStatus?: Ticket['status']) => {
      if (!hasActiveWorkspaceProjects) {
        return;
      }

      setCreateInitialStatus(initialStatus);
      setCreateParentId(undefined);
      setIsCreateModalOpen(true);
    },
    [hasActiveWorkspaceProjects, setCreateInitialStatus, setCreateParentId, setIsCreateModalOpen]
  );

  const handleOpenCreateSubtask = useCallback(
    (parentId: string) => {
      setCreateParentId(parentId);
      setCreateInitialStatus(undefined);
      setIsCreateModalOpen(true);
    },
    [setCreateInitialStatus, setCreateParentId, setIsCreateModalOpen]
  );

  return { handleOpenCreateTicket, handleOpenCreateSubtask };
}
