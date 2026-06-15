import { useCallback } from 'react';

import type { Ticket } from '../../../../context/TicketContext';

interface UseWorkspaceShellCommandsArgs {
  activeWorkspaceId: string;
  currentUser: { id: string } | null;
  tickets: Ticket[];
  activeTicket: Ticket | null;
  activeProjectId: string;
  createTicket: (ticket: {
    title: string;
    description: string;
    status: Ticket['status'];
    priority: Ticket['priority'];
    projectId: string;
    labelIds?: string[];
    cycleId: string | null;
    assigneeId: string | null;
    parentId: string | null;
  }) => Promise<Ticket | null>;
  deleteTicket: (ticketId: string) => Promise<boolean | null>;
  createProject: (projectInput: {
    name: string;
    description: string;
    key: string;
    status?: 'planned' | 'active' | 'completed';
    workspaceId?: string;
    teamId?: string;
  }) => Promise<{ id: string } | null | undefined>;
  refreshWorkspaces: () => Promise<unknown>;
  createLabel: (labelInput: {
    name: string;
    color: string;
    description?: string;
    sortOrder?: number;
    projectId: string;
  }) => Promise<{ id: string } | null | undefined>;
  updateLabel: (labelId: string, updates: { name?: string; color?: string; description?: string; sortOrder?: number }) => Promise<unknown>;
  deleteLabel: (labelId: string) => Promise<boolean | null>;
  setActiveTicket: (ticket: Ticket | null) => void;
  setProjectCreateLoading: (loading: boolean) => void;
  setProjectCreateError: (message: string | null) => void;
  setLabelCreateLoading: (loading: boolean) => void;
  setLabelCreateError: (message: string | null) => void;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  buildProjectScopedPath: (projectId: string, scope?: 'tickets' | 'notes', itemId?: string) => string;
}

interface UseWorkspaceShellCommandsResult {
  handleCreateTicketSubmit: (ticket: {
    title: string;
    description: string;
    status: Ticket['status'];
    priority: Ticket['priority'];
    projectId: string;
    labelIds?: string[];
    cycleId: string | null;
    assigneeId: string | null;
    parentId: string | null;
  }) => Promise<boolean>;
  handleDeleteTicket: (ticketId: string) => Promise<void>;
  handleCreateProject: (projectInput: { name: string; description: string; key: string }) => Promise<void>;
  handleCreateLabel: (labelInput: {
    name: string;
    color: string;
    description?: string;
    sortOrder?: number;
  }) => Promise<void>;
  handleUpdateLabel: (
    labelId: string,
    updates: {
      name?: string;
      color?: string;
      description?: string;
      sortOrder?: number;
    }
  ) => Promise<void>;
  handleDeleteLabel: (labelId: string) => Promise<void>;
}

export function useWorkspaceShellCommands({
  activeWorkspaceId,
  currentUser,
  tickets,
  activeTicket,
  activeProjectId,
  createTicket,
  deleteTicket,
  createProject,
  refreshWorkspaces,
  createLabel,
  updateLabel,
  deleteLabel,
  setActiveTicket,
  setProjectCreateLoading,
  setProjectCreateError,
  setLabelCreateLoading,
  setLabelCreateError,
  navigate,
  buildProjectScopedPath,
}: UseWorkspaceShellCommandsArgs): UseWorkspaceShellCommandsResult {
  const handleCreateTicketSubmit = useCallback(
    async (ticket) => {
      const created = await createTicket(ticket);
      return Boolean(created);
    },
    [createTicket]
  );

  const handleDeleteTicket = useCallback(
    async (ticketId: string) => {
      const deletedTicket =
        tickets.find((ticket) => ticket.id === ticketId) || (activeTicket?.id === ticketId ? activeTicket : null);
      await deleteTicket(ticketId);

      if (deletedTicket && activeTicket?.id === ticketId) {
        navigate(buildProjectScopedPath(deletedTicket.projectId), { replace: true });
        return;
      }

      setActiveTicket(null);
    },
    [activeTicket, buildProjectScopedPath, deleteTicket, navigate, setActiveTicket, tickets]
  );

  const handleCreateProject = useCallback(
    async (projectInput: { name: string; description: string; key: string }) => {
      if (!activeWorkspaceId || !currentUser) {
        return;
      }

      setProjectCreateLoading(true);
      setProjectCreateError(null);

      try {
        const project = await createProject({
          ...projectInput,
          status: 'active',
          workspaceId: activeWorkspaceId,
        });

        if (!project) {
          throw new Error('Failed to create project in this workspace.');
        }

        await refreshWorkspaces();
        setActiveTicket(null);
        navigate(`/workspaces/${activeWorkspaceId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create project in this workspace.';
        setProjectCreateError(message);
        throw error;
      } finally {
        setProjectCreateLoading(false);
      }
    },
    [
      activeWorkspaceId,
      currentUser,
      createProject,
      refreshWorkspaces,
      setActiveTicket,
      setProjectCreateError,
      setProjectCreateLoading,
      navigate,
    ]
  );

  const handleCreateLabel = useCallback(
    async (labelInput: { name: string; color: string; description?: string; sortOrder?: number }) => {
      if (!activeProjectId) {
        return;
      }

      setLabelCreateLoading(true);
      setLabelCreateError(null);

      try {
        const label = await createLabel({
          ...labelInput,
          projectId: activeProjectId,
        });

        if (!label) {
          throw new Error('Failed to create label for this project.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create label for this project.';
        setLabelCreateError(message);
        throw error;
      } finally {
        setLabelCreateLoading(false);
      }
    },
    [activeProjectId, createLabel, setLabelCreateError, setLabelCreateLoading]
  );

  const handleUpdateLabel = useCallback(
    async (labelId: string, updates: { name?: string; color?: string; description?: string; sortOrder?: number }) => {
      setLabelCreateError(null);
      await updateLabel(labelId, updates);
    },
    [setLabelCreateError, updateLabel]
  );

  const handleDeleteLabel = useCallback(
    async (labelId: string) => {
      setLabelCreateError(null);
      const deleted = await deleteLabel(labelId);
      if (!deleted) {
        throw new Error('Failed to delete label.');
      }
    },
    [deleteLabel, setLabelCreateError]
  );

  return {
    handleCreateTicketSubmit,
    handleDeleteTicket,
    handleCreateProject,
    handleCreateLabel,
    handleUpdateLabel,
    handleDeleteLabel,
  };
}
