import { useMemo } from 'react';
import { Kanban, List } from 'lucide-react';
import type { Comment, Cycle, Domain, Project, Ticket, User } from '../../context/TicketContext';
import type { TicketFilters } from '../../utils/ticketView';
import { TicketBoard } from '../../components/TicketBoard';
import { TicketList } from '../../components/TicketList';
import { TicketDetail } from '../../components/TicketDetail';
import {
  filterTickets,
  getWorkspaceHeaderTitle,
  groupTicketsByStatus,
  hasActiveTicketFilters,
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
  projects: Project[];
  tickets: Ticket[];
  users: User[];
  onAddComment: (ticketId: string, body: string) => Promise<void>;
  onDeleteTicket: (ticketId: string) => Promise<void>;
  onOpenCreateSubtask: (parentId: string) => void;
  onOpenCreateTicket: (initialStatus?: Ticket['status']) => void;
  onSelectTicket: (ticket: Ticket | null) => void;
  onSetFilters: (filters: Partial<TicketFilters>) => void;
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
  projects,
  tickets,
  users,
  onAddComment,
  onDeleteTicket,
  onOpenCreateSubtask,
  onOpenCreateTicket,
  onSelectTicket,
  onSetFilters,
  onSetView,
  onUpdateTicket,
}: WorkspacePageProps) {
  const filteredTickets = useMemo(() => filterTickets(tickets, filters), [tickets, filters]);
  const groupedTickets = useMemo(() => groupTicketsByStatus(filteredTickets), [filteredTickets]);
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
  const projectById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project])),
    [projects]
  );
  const cycleById = useMemo(
    () => Object.fromEntries(cycles.map((cycle) => [cycle.id, cycle])),
    [cycles]
  );
  const userById = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user])),
    [users]
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
  const activeAssignee = activeTicket?.assigneeId ? userById[activeTicket.assigneeId] || null : null;
  const activeProject = activeTicket ? projectById[activeTicket.projectId] || null : null;
  const activeDomain = activeTicket?.domainId ? domainById[activeTicket.domainId] || null : null;
  const activeCycle = activeTicket?.cycleId ? cycleById[activeTicket.cycleId] || null : null;

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

      <div className="workspace-page__content">
        <div className={`workspace-page__issues ${activeTicket ? 'workspace-page__issues--hidden' : ''}`}>
          {activeView === 'board' ? (
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
              groupedTickets={groupedTickets}
              domainById={domainById}
              userAvatarById={userAvatarById}
              hasActiveFilters={hasFiltersApplied}
              onFilterChange={onSetFilters}
              onClearFilters={handleClearFilters}
              onSelectTicket={(ticket) => onSelectTicket(ticket)}
            />
          )}
        </div>

        {activeTicket ? (
          <div className="workspace-page__detail">
            <TicketDetail
              activeTicket={activeTicket}
              comments={comments}
              subtasks={detailSubtasks}
              completedSubtasks={completedDetailSubtasks}
              subtaskProgressPercent={detailSubtaskProgressPercent}
              activeAssignee={activeAssignee}
              activeProject={activeProject}
              activeDomain={activeDomain}
              activeCycle={activeCycle}
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