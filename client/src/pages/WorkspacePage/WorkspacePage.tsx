import { useMemo, useCallback, useState } from 'react';
import { Button } from '@library';
import type { Comment, Cycle, Domain, Project, Ticket, User } from '../../context/TicketContext';
import type { TicketFilters, TicketListSort } from '../../modules/tickets/utils/ticketView';
import { TicketBoard, TicketList, TicketDetail, TicketFilterBar } from '../../modules/tickets';
import { NotesList, NoteEditor } from '../../modules/notes';
import {
  filterTickets,
  getWorkspaceHeaderTitle,
  groupTicketsByStatus,
  hasActiveTicketFilters,
  sortTicketsForList,
} from '../../modules/tickets/utils/ticketView';
import { WorkspaceHeader } from '../../modules/workspaces';
import { WorkspaceViewContainer } from '../../components/WorkspaceViewContainer';
import WorkspaceMcpModal from '../../modules/workspaces/components/WorkspaceMcpModal';
import './WorkspacePage.css';

interface WorkspacePageProps {
  workspaceId?: string;
  activeContext?: 'issues' | 'notes';
  activeNoteId?: string;
  activeTicket: Ticket | null;
  activeView: 'board' | 'list';
  comments: Comment[];
  currentUser: User | null;
  cycles: Cycle[];
  domains: Domain[];
  filters: TicketFilters;
  listSort: TicketListSort;
  projects: Project[];
  tickets: Ticket[];
  users: User[];
  onAddComment: (ticketId: string, body: string) => Promise<void>;
  onUpdateComment: (ticketId: string, commentId: string, body: string) => Promise<void>;
  onDeleteComment: (ticketId: string, commentId: string) => Promise<void>;
  onDeleteTicket: (ticketId: string) => Promise<void>;
  onOpenCreateSubtask: (parentId: string) => void;
  onOpenCreateTicket: (initialStatus?: Ticket['status']) => void;
  onOpenProjectManager: () => void;
  onSelectTicket: (ticket: Ticket | null) => void;
  onSelectNote?: (noteId: string) => void;
  onSetFilters: (filters: Partial<TicketFilters>) => void;
  onSetListSort: (sort: TicketListSort) => void;
  onSetView: (view: 'board' | 'list') => void;
  onUpdateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
}

export function WorkspacePage({
  workspaceId,
  activeContext = 'issues',
  activeNoteId,
  activeTicket,
  activeView,
  comments,
  currentUser,
  cycles,
  domains,
  filters,
  listSort,
  projects,
  tickets,
  users,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onDeleteTicket,
  onOpenCreateSubtask,
  onOpenCreateTicket,
  onOpenProjectManager,
  onSelectTicket,
  onSelectNote,
  onSetFilters,
  onSetListSort,
  onSetView,
  onUpdateTicket,
}: WorkspacePageProps) {
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const filteredTickets = useMemo(() => filterTickets(tickets, filters), [tickets, filters]);
  const hasFiltersApplied = useMemo(() => hasActiveTicketFilters(filters), [filters]);
  const headerTitle = useMemo(
    () => getWorkspaceHeaderTitle(filters, currentUser, projects, domains, cycles),
    [filters, currentUser, projects, domains, cycles]
  );
  const userAvatarById = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user.avatar])),
    [users]
  );
  const domainById = useMemo(
    () => Object.fromEntries(domains.map((domain) => [domain.id, domain])),
    [domains]
  );
  const groupedTickets = useMemo(() => groupTicketsByStatus(filteredTickets), [filteredTickets]);
  const listSortedTickets = useMemo(
    () => (activeView === 'list' ? sortTicketsForList(filteredTickets, domainById, listSort) : filteredTickets),
    [activeView, filteredTickets, domainById, listSort]
  );
  const listGroupedTickets = useMemo(
    () => (activeView === 'list' ? groupTicketsByStatus(listSortedTickets) : groupedTickets),
    [activeView, listSortedTickets, groupedTickets]
  );
  const detailSubtasks = useMemo(
    () => (activeTicket ? tickets.filter((ticket) => ticket.parentId === activeTicket.id) : []),
    [tickets, activeTicket]
  );

  const parentTicket = useMemo(
    () => (activeTicket ? tickets.find((t) => t.id === activeTicket.parentId) || null : null),
    [tickets, activeTicket]
  );
  const completedDetailSubtasks = useMemo(
    () => detailSubtasks.filter((ticket) => ticket.status === 'done' || ticket.status === 'canceled').length,
    [detailSubtasks]
  );
  const detailSubtaskProgressPercent = useMemo(
    () => (detailSubtasks.length > 0 ? (completedDetailSubtasks / detailSubtasks.length) * 100 : 0),
    [detailSubtasks, completedDetailSubtasks]
  );
  const handleClearFilters = useCallback(() => {
    onSetFilters({
      ...filters,
      search: '',
      priority: '',
      status: '',
      domainId: '',
      cycleId: '',
      assigneeId: '',
    });
  }, [filters, onSetFilters]);

  const handleCreateNote = useCallback(async () => {
    if (!filters.projectId) return;
    try {
      const response = await fetch('/api/v1/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-id': filters.projectId,
        },
        body: JSON.stringify({
          title: 'Untitled Note',
          body: '',
        }),
      });
      if (response.ok) {
        const note = await response.json();
        onSelectNote?.(note.id);
      }
    } catch (err) {
      console.error('Failed to create note', err);
    }
  }, [filters.projectId, onSelectNote]);

  const displayTitle = activeContext === 'notes' ? 'Notes' : headerTitle;

  return (
    <div className="workspace-page">
      {projects.length > 0 ? (
        <WorkspaceHeader>
          <WorkspaceHeader.Top>
            <WorkspaceHeader.Title>{displayTitle}</WorkspaceHeader.Title>
            {!activeTicket && activeContext === 'issues' && (
              <WorkspaceHeader.ViewToggle
                activeView={activeView}
                onSetView={onSetView}
              />
            )}
            {!activeTicket && activeContext === 'issues' && (
              <div style={{ marginLeft: 12 }} className="workspace-header__mcp-btn">
                <Button type="button" variant="secondary" onClick={() => setIsMcpOpen(true)}>
                  Connect External AI
                </Button>
              </div>
            )}
            {!activeTicket && activeContext === 'notes' && (
              <div style={{ marginLeft: 'auto' }}>
                {activeNoteId ? (
                  <Button type="button" variant="secondary" onClick={() => onSelectNote?.('')}>
                    Back to Notes
                  </Button>
                ) : (
                  <Button type="button" variant="primary" onClick={handleCreateNote}>
                    Create New Note
                  </Button>
                )}
              </div>
            )}
          </WorkspaceHeader.Top>

          {!activeTicket && activeContext === 'issues' && (
            <WorkspaceHeader.Bottom>
              <TicketFilterBar
                filters={filters}
                onFilterChange={onSetFilters}
                hasActiveFilters={hasFiltersApplied}
                onClearFilters={handleClearFilters}
                filteredCount={filteredTickets.length}
                totalCount={tickets.length}
                listSort={activeView === 'list' ? listSort : undefined}
                onListSortChange={activeView === 'list' ? onSetListSort : undefined}
                domains={Object.values(domainById)}
              />
            </WorkspaceHeader.Bottom>
          )}
        </WorkspaceHeader>
      ) : null}

      <div className="workspace-page__content">
        <div className={`workspace-page__issues ${activeTicket ? 'workspace-page__issues--hidden' : ''}`}>
          <div className="workspace-page__issues-shell">
            <div className="workspace-page__issues-content">
              {activeContext === 'notes' ? (
                <WorkspaceViewContainer>
                  {activeNoteId ? (
                    <NoteEditor projectId={filters.projectId || ''} noteId={activeNoteId} />
                  ) : (
                    <NotesList projectId={filters.projectId || ''} onSelectNote={onSelectNote || (() => { })} />
                  )}
                </WorkspaceViewContainer>
              ) : projects.length === 0 ? (
                <div className="workspace-page__empty-state">
                  <div className="workspace-page__empty-state-title">No projects in this workspace yet</div>
                  <p className="workspace-page__empty-state-copy">
                    Open Manage Projects to create the first project for this workspace. Once a project exists, tickets, domains, and cycles will become available here.
                  </p>
                  <div className="workspace-page__empty-state-actions">
                    <Button
                      type="button"
                      variant="primary"
                      className="workspace-page__projects-button workspace-page__projects-button--primary"
                      onClick={onOpenProjectManager}
                    >
                      Manage Projects
                    </Button>
                  </div>
                </div>
              ) : activeView === 'board' ? (
                <WorkspaceViewContainer>
                  <TicketBoard
                    ticketsByColumn={groupedTickets}
                    domainById={domainById}
                    userAvatarById={userAvatarById}
                    onMoveTicket={onUpdateTicket}
                    onSelectTicket={onSelectTicket}
                    onOpenCreateTicket={onOpenCreateTicket}
                  />
                </WorkspaceViewContainer>
              ) : (
                <WorkspaceViewContainer>
                  <TicketList
                    filteredCount={filteredTickets.length}
                    groupedTickets={listGroupedTickets}
                    domainById={domainById}
                    userAvatarById={userAvatarById}
                    onSelectTicket={onSelectTicket}
                  />
                </WorkspaceViewContainer>
              )}
            </div>
          </div>
        </div>

        {activeTicket ? (
          <div key={activeTicket.id} className="workspace-page__detail">
            <TicketDetail
              activeTicket={activeTicket}
              comments={comments}
              subtasks={detailSubtasks}
              completedSubtasks={completedDetailSubtasks}
              subtaskProgressPercent={detailSubtaskProgressPercent}
              parentTicket={parentTicket}
              users={users}
              projects={projects}
              domains={domains}
              cycles={cycles}
              onSelectTicket={onSelectTicket}
              onUpdateTicket={onUpdateTicket}
              onDeleteTicket={onDeleteTicket}
              onAddComment={onAddComment}
              onUpdateComment={onUpdateComment}
              onDeleteComment={onDeleteComment}
              onClose={() => onSelectTicket(null)}
              onOpenCreateSubtask={onOpenCreateSubtask}
            />
          </div>
        ) : null}
      </div>
      <WorkspaceMcpModal workspaceId={workspaceId} isOpen={isMcpOpen} onClose={() => setIsMcpOpen(false)} />
    </div>
  );
}