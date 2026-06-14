import { useMemo, useCallback, useState } from 'react';
import { Button, Timeline, createEmptyRichTextValue, ContextMenu } from '@library';
import type { Comment, Cycle, Label, Project, Ticket, User } from '../../context/TicketContext';
import type { TicketFilters, TicketListSort } from '../../modules/tickets/utils/ticketView';
import { TicketBoard, TicketList, TicketFilterBar } from '../../modules/tickets';
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
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { WorkspacePageContextMenu } from './WorkspacePageContextMenu';
import './WorkspacePage.css';

export type WorkspaceIssueView = 'board' | 'list' | 'timeline';

interface WorkspacePageProps {
  workspaceId?: string;
  workspaceName?: string;
  pathname?: string;
  activeContext?: 'issues' | 'notes';
  activeNoteId?: string;
  activeTicket: Ticket | null;
  activeView: WorkspaceIssueView;
  viewModeLocked?: boolean;
  isTeamWorkspace?: boolean;
  hasTeams?: boolean;
  currentUser: User | null;
  cycles: Cycle[];
  labels?: Label[];
  domains?: Label[];
  filters: TicketFilters;
  listSort: TicketListSort;
  projects: Project[];
  tickets: Ticket[];
  users: User[];
  onOpenCreateTicket: (initialStatus?: Ticket['status']) => void;
  onOpenProjectManager: () => void;
  onOpenTeamManager?: () => void;
  onOpenTeamProjectManager?: () => void;
  onSelectTicket: (ticket: Ticket | null) => void;
  onSelectNote?: (noteId: string) => void;
  onSetFilters: (filters: Partial<TicketFilters>) => void;
  onSetListSort: (sort: TicketListSort) => void;
  onSetView: (view: 'board' | 'list') => void;
  onUpdateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
}

const STATUS_LABELS: Record<Ticket['status'], string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  canceled: 'Canceled',
};

const PRIORITY_LABELS: Record<Ticket['priority'], string> = {
  no_priority: 'No priority',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

function formatTimelineDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No date';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getTicketProjectName(ticket: Ticket, projectById: Record<string, Project>) {
  return projectById[ticket.projectId]?.name || (ticket as Ticket & { projectName?: string }).projectName || '';
}

export function WorkspacePage({
  workspaceId,
  workspaceName,
  pathname,
  activeContext = 'issues',
  activeNoteId,
  activeTicket,
  activeView,
  viewModeLocked = false,
  isTeamWorkspace = false,
  hasTeams = false,
  currentUser,
  cycles,
  labels: labelItems,
  domains: domainItems,
  filters,
  listSort,
  projects,
  tickets,
  users,
  onOpenCreateTicket,
  onOpenProjectManager,
  onOpenTeamManager,
  onOpenTeamProjectManager,
  onSelectTicket,
  onSelectNote,
  onSetFilters,
  onSetListSort,
  onSetView,
  onUpdateTicket,
}: WorkspacePageProps) {
  const [activeNoteTitle, setActiveNoteTitle] = useState('');
  const [notesSort, setNotesSort] = useState<'desc' | 'asc'>('desc');
  const labels = labelItems ?? domainItems ?? [];
  const filteredTickets = useMemo(() => filterTickets(tickets, filters), [tickets, filters]);
  const hasFiltersApplied = useMemo(() => hasActiveTicketFilters(filters), [filters]);
  const headerTitle = useMemo(
    () => getWorkspaceHeaderTitle(filters, currentUser, projects, labels, cycles),
    [filters, currentUser, projects, labels, cycles]
  );
  const userAvatarById = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user.avatar])),
    [users]
  );
  const isTeamScopedRoute = !!pathname && pathname.includes('/teams/');
  const labelById = useMemo(
    () => Object.fromEntries(labels.map((label) => [label.id, label])),
    [labels]
  );
  const projectById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects]
  );
  // Show project badge on rows when viewing multiple projects at once (no single-project filter)
  const showProjectBadges = !filters.projectId && projects.length > 1;
  const groupedTickets = useMemo(() => groupTicketsByStatus(filteredTickets), [filteredTickets]);
  const listSortedTickets = useMemo(
    () => (activeView === 'list' ? sortTicketsForList(filteredTickets, labelById, listSort) : filteredTickets),
    [activeView, filteredTickets, labelById, listSort]
  );
  const listGroupedTickets = useMemo(
    () => (activeView === 'list' ? groupTicketsByStatus(listSortedTickets) : groupedTickets),
    [activeView, listSortedTickets, groupedTickets]
  );
  const timelineTickets = useMemo(
    () =>
      [...filteredTickets].sort((first, second) =>
        (second.updatedAt || second.createdAt).localeCompare(first.updatedAt || first.createdAt)
      ),
    [filteredTickets]
  );
  const timelineEvents = useMemo(
    () =>
      timelineTickets.map((ticket) => {
        const projectName = getTicketProjectName(ticket, projectById);
        const meta = [
          projectName,
          STATUS_LABELS[ticket.status],
          PRIORITY_LABELS[ticket.priority],
        ].filter(Boolean);

        return {
          time: formatTimelineDate(ticket.updatedAt || ticket.createdAt),
          title: (
            <button
              type="button"
              className="workspace-page__timeline-ticket"
              onClick={() => onSelectTicket(ticket)}
            >
              <span className="workspace-page__timeline-key">{ticket.key}</span>
              <span>{ticket.title}</span>
            </button>
          ),
          description: meta.join(' - '),
        };
      }),
    [onSelectTicket, projectById, timelineTickets]
  );
  const handleClearFilters = useCallback(() => {
    onSetFilters({
      ...filters,
      search: '',
      priority: '',
      status: '',
      labels: [],
      labelId: '',
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
          body: createEmptyRichTextValue(),
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

  const isNoteEditor = activeContext === 'notes' && activeNoteId;
  const isTicketEditor = activeContext === 'issues' && activeTicket;
  const showTeamScopedProjectEmptyState = isTeamWorkspace && isTeamScopedRoute;
  const showTeamWorkspaceTaskEmptyState = isTeamWorkspace && !showTeamScopedProjectEmptyState && hasTeams;
  const emptyStateTitle = showTeamScopedProjectEmptyState
    ? 'No projects in this team yet'
    : showTeamWorkspaceTaskEmptyState
      ? 'No tasks in this workspace yet'
      : isTeamWorkspace
        ? 'Create your first team'
        : 'No projects in this workspace yet';
  const emptyStateCopy = showTeamScopedProjectEmptyState
    ? 'Create a project for this team to start organizing work, tickets, and milestones.'
    : showTeamWorkspaceTaskEmptyState
      ? 'Teams and projects are ready, but there are no tasks yet. Create a project or open Manage Projects to start tracking work.'
      : isTeamWorkspace
        ? 'Teams organize projects, cycles, labels, and aggregate task views in this workspace. Create the first team to start building out your workspace.'
        : 'Open Manage Projects to create the first project for this workspace. Once a project exists, tickets, labels, and cycles will become available here.';
  const emptyStateActionLabel = showTeamScopedProjectEmptyState
    ? 'Create Project'
    : showTeamWorkspaceTaskEmptyState
      ? 'Manage Projects'
      : isTeamWorkspace
        ? 'Create Team'
        : 'Manage Projects';
  const emptyStateActionHandler = showTeamScopedProjectEmptyState
    ? (onOpenTeamProjectManager ?? onOpenProjectManager)
    : showTeamWorkspaceTaskEmptyState
      ? onOpenProjectManager
      : isTeamWorkspace
        ? (onOpenTeamManager ?? onOpenProjectManager)
        : onOpenProjectManager;

  let displayTitle = '';
  if (activeContext === 'notes') {
    displayTitle = isNoteEditor ? (activeNoteTitle ? `Notes - ${activeNoteTitle}` : 'Notes') : 'Notes';
  } else {
    displayTitle = isTicketEditor ? `Tickets - ${activeTicket.key}` : headerTitle;
  }

  return (
    <div className="workspace-page">
      {projects.length > 0 ? (
        <WorkspaceHeader>
          <WorkspaceHeader.Top>
            <WorkspaceHeader.Title>{displayTitle}</WorkspaceHeader.Title>
            {!activeTicket && activeContext === 'issues' && (
              <div style={{ marginLeft: 'auto' }}>
                {!viewModeLocked ? (
                  <WorkspaceHeader.ViewToggle
                    activeView={activeView}
                    onSetView={onSetView}
                  />
                ) : null}
              </div>
            )}
            {!activeTicket && activeContext === 'notes' && (
              <div style={{ marginLeft: 'auto' }}>
                {activeNoteId ? (
                  <Button type="button" variant="secondary" onClick={() => window.history.back()}>
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
                labels={Object.values(labelById)}
                cycles={cycles}
                users={users}
              />
            </WorkspaceHeader.Bottom>
          )}
        </WorkspaceHeader>
      ) : null}

      <div className="workspace-page__content">
        <div className="workspace-page__issues">
          <div className="workspace-page__issues-shell">
            <ContextMenu.Root
              content={
                <WorkspacePageContextMenu
                  activeContext={activeContext}
                  activeTicket={activeTicket}
                  activeNoteId={activeNoteId}
                  filters={filters}
                  projects={projects}
                  labels={labels}
                  cycles={cycles}
                  users={users}
                  notesSort={notesSort}
                  onOpenCreateTicket={onOpenCreateTicket}
                  onCreateNote={handleCreateNote}
                  onSetFilters={onSetFilters}
                  setNotesSort={setNotesSort}
                />
              }
            >
              <div className="workspace-page__issues-content">
                {/* Notes panel — always mounted, hidden when not in notes context */}
                <div className={activeContext !== 'notes' ? 'workspace-page__issues--hidden' : ''}>
                  <QueryErrorResetBoundary>
                    {({ reset }) => (
                      <ErrorBoundary onReset={reset}>
                        <WorkspaceViewContainer>
                          {activeNoteId ? (
                            <NoteEditor projectId={filters.projectId || ''} noteId={activeNoteId} onTitleChange={setActiveNoteTitle} />
                          ) : (
                            <NotesList projectId={filters.projectId || ''} onSelectNote={onSelectNote || (() => { })} sortDirection={notesSort} />
                          )}
                        </WorkspaceViewContainer>
                      </ErrorBoundary>
                    )}
                  </QueryErrorResetBoundary>
                </div>

                {/* Tickets panel — always mounted, hidden when in notes context */}
                <div className={activeContext === 'notes' ? 'workspace-page__issues--hidden' : ''}>
                  <QueryErrorResetBoundary>
                    {({ reset }) => (
                      <ErrorBoundary onReset={reset}>
                        {projects.length === 0 ? (
                          <div className="workspace-page__empty-state">
                            <div className="workspace-page__empty-state-title">{emptyStateTitle}</div>
                            <p className="workspace-page__empty-state-copy">{emptyStateCopy}</p>
                            <div className="workspace-page__empty-state-actions">
                              <Button
                                type="button"
                                variant="primary"
                                className="workspace-page__projects-button workspace-page__projects-button--primary"
                                onClick={emptyStateActionHandler}
                              >
                                {emptyStateActionLabel}
                              </Button>
                            </div>
                          </div>
                        ) : activeView === 'timeline' ? (
                          <WorkspaceViewContainer>
                            <div className="workspace-page__timeline-shell">
                              <div className="workspace-page__timeline-header">
                                <div>
                                  <div className="workspace-page__timeline-eyebrow">Timeline</div>
                                  <h2 className="workspace-page__timeline-title">Recent task activity</h2>
                                </div>
                                <span className="workspace-page__timeline-count">
                                  {filteredTickets.length} {filteredTickets.length === 1 ? 'task' : 'tasks'}
                                </span>
                              </div>
                              {timelineEvents.length > 0 ? (
                                <Timeline events={timelineEvents} />
                              ) : (
                                <div className="workspace-page__timeline-empty">
                                  No tasks match the current filters.
                                </div>
                              )}
                            </div>
                          </WorkspaceViewContainer>
                        ) : activeView === 'board' ? (
                          <WorkspaceViewContainer>
                            <TicketBoard
                              ticketsByColumn={groupedTickets}
                              labelById={labelById}
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
                              labelById={labelById}
                              userAvatarById={userAvatarById}
                              projectById={showProjectBadges ? projectById : undefined}
                              onSelectTicket={onSelectTicket}
                            />
                          </WorkspaceViewContainer>
                        )}
                      </ErrorBoundary>
                    )}
                  </QueryErrorResetBoundary>
                </div>
              </div>
            </ContextMenu.Root>
          </div>
        </div>
      </div>
    </div>
  );
}
