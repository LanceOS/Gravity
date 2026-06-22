import { useCallback } from 'react';

import type { Ticket } from '../../../context/TicketContextContext';
import { useCommentContext } from '../../../context/comment/CommentContext';
import { useTicketRelationsContext } from '../../../context/relation/TicketRelationsContext';
import { useTicketDetailContext } from '../../../context/ticket/TicketDetailContext';
import { useTicketMutations } from '../../../context/ticket/TicketMutationContext';
import type { Cycle, Label, Project, User } from '../../../types/domain';
import { CreateTicketModal, TicketDetailRoute, type TicketFilters, type TicketListSort } from '../../tickets';
import { WorkspacePage } from '../../workspacePage';
import type { WorkspaceIssueView } from '../../workspacePage/screens/WorkspacePage';
import { useWebMcpRegistration } from '../hooks/useWebMcpRegistration';

type Navigate = (to: string, options?: { replace?: boolean }) => void;

interface WorkspaceIssueSurfaceProps {
  activeWorkspaceId: string;
  workspaceName: string;
  pathname: string;
  activeContext: 'issues' | 'notes';
  activeNoteId: string;
  activeTicket: Ticket | null;
  activeView: WorkspaceIssueView;
  viewModeLocked: boolean;
  isTeamWorkspace: boolean;
  hasTeams: boolean;
  currentUser: User | null;
  cycles: Cycle[];
  labels: Label[];
  filters: TicketFilters;
  listSort: TicketListSort;
  projects: Project[];
  projectsLoading: boolean;
  tickets: Ticket[];
  users: User[];
  routeTicketKey?: string;
  ticketsByKey: Map<string, Ticket>;
  ticketsById: Map<string, Ticket>;
  isLoadingTickets: boolean;
  onOpenCreateTicket: (initialStatus?: Ticket['status']) => void;
  onOpenCreateSubtask: (parentId: string) => void;
  onOpenProjectManager: () => void;
  onOpenTeamManager: () => void;
  onOpenTeamProjectManager: () => void;
  onSelectTicket: (ticket: Ticket | null) => void;
  onSelectNote: (noteId: string) => void;
  onSetFilters: (updates: Partial<TicketFilters>) => void;
  onSetListSort: (sort: TicketListSort) => void;
  onSetView: (view: 'board' | 'list') => void;
  onLoadMoreTickets?: () => void;
  hasMoreTickets: boolean;
  isLoadingMoreTickets: boolean;
  createTicket: {
    isOpen: boolean;
    onClose: () => void;
    projects: Project[];
    labels: Label[];
    cycles: Cycle[];
    users: User[];
    parentTicket: Ticket | null;
    defaultProjectId: string;
    initialStatus?: Ticket['status'];
    parentId?: string;
  };
  navigation: {
    navigate: Navigate;
    buildProjectScopedPath: (projectId: string, scope?: 'tickets' | 'notes', itemId?: string) => string;
    setActiveTicket: (ticket: Ticket | null) => void;
  };
  webMcp: {
    tickets: Ticket[];
    users: User[];
    projects: Project[];
  };
}

export function WorkspaceIssueSurface({
  activeWorkspaceId,
  workspaceName,
  pathname,
  activeContext,
  activeNoteId,
  activeTicket,
  activeView,
  viewModeLocked,
  isTeamWorkspace,
  hasTeams,
  currentUser,
  cycles,
  labels,
  filters,
  listSort,
  projects,
  projectsLoading,
  tickets,
  users,
  routeTicketKey,
  ticketsByKey,
  ticketsById,
  isLoadingTickets,
  onOpenCreateTicket,
  onOpenCreateSubtask,
  onOpenProjectManager,
  onOpenTeamManager,
  onOpenTeamProjectManager,
  onSelectTicket,
  onSelectNote,
  onSetFilters,
  onSetListSort,
  onSetView,
  onLoadMoreTickets,
  hasMoreTickets,
  isLoadingMoreTickets,
  createTicket: createTicketModal,
  navigation,
  webMcp,
}: WorkspaceIssueSurfaceProps) {
  const { createTicket, updateTicket, deleteTicket } = useTicketMutations();
  const { addComment, updateComment, deleteComment } = useCommentContext();
  const { activeTicketDetail, comments } = useTicketDetailContext();
  const {
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  } = useTicketRelationsContext();

  useWebMcpRegistration({
    tickets: webMcp.tickets,
    users: webMcp.users,
    projects: webMcp.projects,
    createTicket,
    updateTicket,
    addComment,
    addTicketBlocker,
    removeTicketBlocker,
  });

  const handleCreateTicketSubmit = useCallback(
    async (ticket: Parameters<typeof createTicket>[0]) => {
      const created = await createTicket(ticket);
      return Boolean(created);
    },
    [createTicket],
  );

  const handleDeleteTicket = useCallback(
    async (ticketId: string) => {
      const deletedTicket = ticketsById.get(ticketId) || (activeTicket?.id === ticketId ? activeTicket : null);
      await deleteTicket(ticketId);

      if (deletedTicket && activeTicket?.id === ticketId) {
        navigation.navigate(navigation.buildProjectScopedPath(deletedTicket.projectId), { replace: true });
        return;
      }

      navigation.setActiveTicket(null);
    },
    [activeTicket, deleteTicket, navigation, ticketsById],
  );

  const activeRouteTicket = routeTicketKey
    ? ticketsByKey.get(routeTicketKey.toUpperCase()) || activeTicket
    : activeTicket;

  return (
    <>
      {routeTicketKey ? (
        <TicketDetailRoute
          activeWorkspaceId={activeWorkspaceId}
          activeTicket={activeRouteTicket}
          activeTicketDetail={activeTicketDetail}
          comments={comments}
          tickets={tickets}
          users={users}
          projects={createTicketModal.projects}
          labels={labels}
          cycles={cycles}
          onSelectTicket={onSelectTicket}
          onUpdateTicket={updateTicket}
          onDeleteTicket={handleDeleteTicket}
          onAddComment={addComment}
          onUpdateComment={updateComment}
          onDeleteComment={deleteComment}
          onOpenCreateSubtask={onOpenCreateSubtask}
          onAddDependency={addTicketDependency}
          onRemoveDependency={removeTicketDependency}
          onAddBlocker={addTicketBlocker}
          onRemoveBlocker={removeTicketBlocker}
          ticketsById={ticketsById}
          isLoading={isLoadingTickets}
        />
      ) : (
        <WorkspacePage
          workspaceId={activeWorkspaceId}
          workspaceName={workspaceName}
          pathname={pathname}
          activeContext={activeContext}
          activeTicket={activeTicket}
          activeView={activeView}
          viewModeLocked={viewModeLocked}
          isTeamWorkspace={isTeamWorkspace}
          hasTeams={hasTeams}
          currentUser={currentUser}
          cycles={cycles}
          labels={labels}
          filters={filters}
          listSort={listSort}
          projects={projects}
          projectsLoading={projectsLoading}
          tickets={tickets}
          users={users}
          onOpenCreateTicket={onOpenCreateTicket}
          onOpenProjectManager={onOpenProjectManager}
          onOpenTeamManager={onOpenTeamManager}
          onSelectTicket={onSelectTicket}
          onSelectNote={onSelectNote}
          activeNoteId={activeNoteId}
          onSetFilters={onSetFilters}
          onSetListSort={onSetListSort}
          onSetView={onSetView}
          onUpdateTicket={updateTicket}
          onOpenTeamProjectManager={onOpenTeamProjectManager}
          onLoadMoreTickets={onLoadMoreTickets}
          hasMoreTickets={hasMoreTickets}
          isLoadingMoreTickets={isLoadingMoreTickets}
          isLoadingTickets={isLoadingTickets}
        />
      )}

      {createTicketModal.isOpen ? (
        <CreateTicketModal
          onClose={createTicketModal.onClose}
          projects={createTicketModal.projects}
          labels={createTicketModal.labels}
          cycles={createTicketModal.cycles}
          users={createTicketModal.users}
          parentTicket={createTicketModal.parentTicket}
          defaultProjectId={createTicketModal.defaultProjectId}
          onSubmitTicket={handleCreateTicketSubmit}
          initialStatus={createTicketModal.initialStatus}
          parentId={createTicketModal.parentId}
        />
      ) : null}
    </>
  );
}
