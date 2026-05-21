import { useMemo } from 'react';
import { Kanban, List } from 'lucide-react';
import { Button } from '@library';
import type { Comment, Cycle, Domain, Project, Ticket, User } from '../../context/TicketContext';
import type { TicketFilters, TicketListSort } from '../../utils/ticketView';
import { TicketBoard } from '../../components/TicketBoard';
import { TicketList } from '../../components/TicketList';
import { TicketDetail } from '../../components/TicketDetail';
import {
  filterTickets,
  getWorkspaceHeaderTitle,
  groupTicketsByStatus,
  hasActiveTicketFilters,
  sortTicketsForList,
} from '../../utils/ticketView';
import './WorkspacePage.css';

interface WorkspacePageProps {
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
  onDeleteTicket: (ticketId: string) => Promise<void>;
  onOpenCreateSubtask: (parentId: string) => void;
  onOpenCreateTicket: (initialStatus?: Ticket['status']) => void;
  onOpenProjectManager: () => void;
  onSelectTicket: (ticket: Ticket | null) => void;
  onSetFilters: (filters: Partial<TicketFilters>) => void;
  onSetListSort: (sort: TicketListSort) => void;
  onSetView: (view: 'board' | 'list') => void;
  onUpdateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
}

export function WorkspacePage({
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
  onDeleteTicket,
  onOpenCreateSubtask,
  onOpenCreateTicket,
  onOpenProjectManager,
  onSelectTicket,
  onSetFilters,
  onSetListSort,
  onSetView,
  onUpdateTicket,
}: WorkspacePageProps) {
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
  const completedDetailSubtasks = useMemo(
    () => detailSubtasks.filter((ticket) => ticket.status === 'done' || ticket.status === 'canceled').length,
    [detailSubtasks]
  );
  const detailSubtaskProgressPercent = useMemo(
    () => (detailSubtasks.length > 0 ? (completedDetailSubtasks / detailSubtasks.length) * 100 : 0),
    [detailSubtasks, completedDetailSubtasks]
  );
  const handleClearFilters = () => {
    onSetFilters({
      search: '',
      priority: '',
      status: '',
      projectId: '',
      domainId: '',
      cycleId: '',
      assigneeId: '',
    });
  };

  return (
    <div className="workspace-page">
      {projects.length > 0 ? (
        <header className="workspace-page__header">
          <div className="workspace-page__title-group">
            <span className="workspace-page__title">{headerTitle}</span>
          </div>

          <div className="workspace-page__view-toggle" role="tablist" aria-label="View mode">
            <button
              type="button"
              onClick={() => onSetView('board')}
              className={`workspace-page__view-button ${activeView === 'board' ? 'workspace-page__view-button--active' : ''}`}
            >
              <Kanban size={12} />
              <span>Board</span>
            </button>
            <button
              type="button"
              onClick={() => onSetView('list')}
              className={`workspace-page__view-button ${activeView === 'list' ? 'workspace-page__view-button--active' : ''}`}
            >
              <List size={12} />
              <span>List</span>
            </button>
          </div>
        </header>
      ) : null}

      <div className="workspace-page__content">
        <div className={`workspace-page__issues ${activeTicket ? 'workspace-page__issues--hidden' : ''}`}>
          <div className="workspace-page__issues-shell">
            <div className="workspace-page__issues-content">
              {projects.length === 0 ? (
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
                <TicketBoard
                  projects={projects}
                  filters={filters}
                  filteredCount={filteredTickets.length}
                  totalCount={tickets.length}
                  ticketsByColumn={groupedTickets}
                  domainById={domainById}
                  userAvatarById={userAvatarById}
                  hasActiveFilters={hasFiltersApplied}
                  onFilterChange={onSetFilters}
                  onClearFilters={handleClearFilters}
                  onMoveTicket={onUpdateTicket}
                  onSelectTicket={(ticket) => onSelectTicket(ticket)}
                  onOpenCreateTicket={onOpenCreateTicket}
                />
              ) : (
                <TicketList
                  filters={filters}
                  filteredCount={filteredTickets.length}
                  totalCount={tickets.length}
                  groupedTickets={listGroupedTickets}
                  listSort={listSort}
                  domainById={domainById}
                  userAvatarById={userAvatarById}
                  hasActiveFilters={hasFiltersApplied}
                  onFilterChange={onSetFilters}
                  onClearFilters={handleClearFilters}
                  onListSortChange={onSetListSort}
                  onSelectTicket={(ticket) => onSelectTicket(ticket)}
                />
              )}
            </div>
          </div>
        </div>

        {activeTicket ? (
          <div className="workspace-page__detail">
            <TicketDetail
              key={activeTicket.id}
              activeTicket={activeTicket}
              comments={comments}
              subtasks={detailSubtasks}
              completedSubtasks={completedDetailSubtasks}
              subtaskProgressPercent={detailSubtaskProgressPercent}
              users={users}
              projects={projects}
              domains={domains}
              cycles={cycles}
              onSelectTicket={onSelectTicket}
              onUpdateTicket={onUpdateTicket}
              onDeleteTicket={onDeleteTicket}
              onAddComment={onAddComment}
              onClose={() => onSelectTicket(null)}
              onOpenCreateSubtask={onOpenCreateSubtask}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}