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

const VALID_TICKET_STATUSES = new Set<Ticket['status']>([
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
]);

export function useWorkspaceCreateTicketDialog({
  hasActiveWorkspaceProjects,
  setCreateInitialStatus,
  setCreateParentId,
  setIsCreateModalOpen,
}: UseWorkspaceCreateTicketDialogArgs): UseWorkspaceCreateTicketDialogResult {
  const normalizeInitialStatus = (initialStatus?: unknown): Ticket['status'] | undefined => {
    return typeof initialStatus === 'string' && VALID_TICKET_STATUSES.has(initialStatus as Ticket['status'])
      ? (initialStatus as Ticket['status'])
      : undefined;
  };

  const handleOpenCreateTicket = useCallback(
    (initialStatus?: unknown) => {
      if (!hasActiveWorkspaceProjects) {
        return;
      }

      setCreateInitialStatus(normalizeInitialStatus(initialStatus));
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
