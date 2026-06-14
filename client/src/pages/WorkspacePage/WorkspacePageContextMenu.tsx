import React, { memo } from 'react';
import { ContextMenu } from '@library';
import { Check, User as UserIcon, FolderKanban, Activity, Tag, Calendar, Plus, ArrowDown, ArrowUp } from 'lucide-react';
import type { Cycle, Label, Project, Ticket, User } from '../../context/TicketContext';
import type { TicketFilters } from '../../modules/tickets/utils/ticketView';
import { getPriorityIcon } from '../../modules/tickets/utils/TicketBoard';
import { getStatusColor } from '../../modules/tickets/utils/TicketList';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../modules/tickets/utils/TicketDetail';

interface WorkspacePageContextMenuProps {
  activeContext: 'issues' | 'notes';
  activeTicket: Ticket | null;
  activeNoteId?: string;
  filters: TicketFilters;
  projects: Project[];
  labels: Label[];
  cycles: Cycle[];
  users: User[];
  notesSort: 'desc' | 'asc';
  onOpenCreateTicket: () => void;
  onCreateNote: () => void;
  onSetFilters: (filters: Partial<TicketFilters>) => void;
  setNotesSort: (sort: 'desc' | 'asc') => void;
}

export const WorkspacePageContextMenu = memo(function WorkspacePageContextMenu({
  activeContext,
  activeTicket,
  activeNoteId,
  filters,
  projects,
  labels,
  cycles,
  users,
  notesSort,
  onOpenCreateTicket,
  onCreateNote,
  onSetFilters,
  setNotesSort,
}: WorkspacePageContextMenuProps) {
  const activeIssueMenu = activeContext === 'issues' && !activeTicket;
  const activeNotesMenu = activeContext === 'notes' && !activeNoteId;

  if (!activeIssueMenu && !activeNotesMenu) {
    return null;
  }

  const toggleProjectFilter = (projectId: string) => {
    onSetFilters({ ...filters, projectId: filters.projectId === projectId ? '' : projectId });
  };

  const toggleStatusFilter = (value: Ticket['status']) => {
    onSetFilters({ ...filters, status: filters.status === value ? '' : value });
  };

  const togglePriorityFilter = (value: Ticket['priority']) => {
    onSetFilters({ ...filters, priority: filters.priority === value ? '' : value });
  };

  const toggleAssigneeFilter = (userId: string) => {
    onSetFilters({ ...filters, assigneeId: filters.assigneeId === userId ? '' : userId });
  };

  const toggleLabelFilter = (labelId: string) => {
    onSetFilters({ ...filters, labelId: filters.labelId === labelId ? '' : labelId });
  };

  const toggleCycleFilter = (cycleId: string) => {
    onSetFilters({ ...filters, cycleId: filters.cycleId === cycleId ? '' : cycleId });
  };

  return (
    <>
      {activeIssueMenu ? (
        <>
          <ContextMenu.Item icon={<Plus size={14} />} onClick={onOpenCreateTicket}>
            New Ticket
          </ContextMenu.Item>
          <ContextMenu.Item icon={<Activity size={14} />}>
            Filter By
            <ContextMenu.SubMenu>
              <ContextMenu.Item icon={<FolderKanban size={14} />}>
                Project
                <ContextMenu.SubMenu>
                  {projects.length === 0 ? (
                    <ContextMenu.Item disabled>No Projects</ContextMenu.Item>
                  ) : (
                    projects.map((project) => (
                      <ContextMenu.Item
                        key={project.id}
                        icon={filters.projectId === project.id ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                        onClick={() => toggleProjectFilter(project.id)}
                      >
                        {project.name}
                      </ContextMenu.Item>
                    ))
                  )}
                </ContextMenu.SubMenu>
              </ContextMenu.Item>
              <ContextMenu.Item icon={<Activity size={14} />}>
                Status
                <ContextMenu.SubMenu>
                  {STATUS_OPTIONS.map((option) => (
                    <ContextMenu.Item
                      key={option.value}
                      icon={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {filters.status === option.value ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                          <div
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: getStatusColor(option.value),
                            }}
                          />
                        </div>
                      }
                      onClick={() => toggleStatusFilter(option.value as Ticket['status'])}
                    >
                      {option.label}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubMenu>
              </ContextMenu.Item>
              <ContextMenu.Item icon={<Activity size={14} />}>
                Priority
                <ContextMenu.SubMenu>
                  {PRIORITY_OPTIONS.map((option) => (
                    <ContextMenu.Item
                      key={option.value}
                      icon={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {filters.priority === option.value ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                          {getPriorityIcon(option.value as Ticket['priority'])}
                        </div>
                      }
                      onClick={() => togglePriorityFilter(option.value as Ticket['priority'])}
                    >
                      {option.label}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubMenu>
              </ContextMenu.Item>
              <ContextMenu.Item icon={<UserIcon size={14} />}>
                Assignee
                <ContextMenu.SubMenu>
                  {users.length === 0 ? (
                    <ContextMenu.Item disabled>No Assignees</ContextMenu.Item>
                  ) : (
                    users.map((user) => (
                      <ContextMenu.Item
                        key={user.id}
                        icon={
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {filters.assigneeId === user.id ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                            {user.avatar && (
                              <img
                                src={user.avatar}
                                alt=""
                                style={{ width: '14px', height: '14px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                            )}
                          </div>
                        }
                        onClick={() => toggleAssigneeFilter(user.id)}
                      >
                        {user.name}
                      </ContextMenu.Item>
                    ))
                  )}
                </ContextMenu.SubMenu>
              </ContextMenu.Item>
              <ContextMenu.Item icon={<Tag size={14} />}>
                Label
                <ContextMenu.SubMenu>
                  {labels.length === 0 ? (
                    <ContextMenu.Item disabled>No Labels</ContextMenu.Item>
                  ) : (
                    labels.map((label) => (
                      <ContextMenu.Item
                        key={label.id}
                        icon={
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {filters.labelId === label.id ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                            <div
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: label.color || '#6B7280',
                              }}
                            />
                          </div>
                        }
                        onClick={() => toggleLabelFilter(label.id)}
                      >
                        {label.name}
                      </ContextMenu.Item>
                    ))
                  )}
                </ContextMenu.SubMenu>
              </ContextMenu.Item>
              <ContextMenu.Item icon={<Calendar size={14} />}>
                Cycle
                <ContextMenu.SubMenu>
                  {cycles.length === 0 ? (
                    <ContextMenu.Item disabled>No Cycles</ContextMenu.Item>
                  ) : (
                    cycles.map((cycle) => (
                      <ContextMenu.Item
                        key={cycle.id}
                        icon={filters.cycleId === cycle.id ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                        onClick={() => toggleCycleFilter(cycle.id)}
                      >
                        {cycle.name}
                      </ContextMenu.Item>
                    ))
                  )}
                </ContextMenu.SubMenu>
              </ContextMenu.Item>
            </ContextMenu.SubMenu>
          </ContextMenu.Item>
        </>
      ) : null}

      {activeNotesMenu ? (
        <>
          <ContextMenu.Item icon={<Plus size={14} />} onClick={onCreateNote}>
            Create New Note
          </ContextMenu.Item>
          <ContextMenu.Item icon={<Activity size={14} />}>
            Filter By
            <ContextMenu.SubMenu>
              <ContextMenu.Item
                icon={notesSort === 'desc' ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <ArrowDown size={14} />}
                onClick={() => setNotesSort('desc')}
              >
                Newest
              </ContextMenu.Item>
              <ContextMenu.Item
                icon={notesSort === 'asc' ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <ArrowUp size={14} />}
                onClick={() => setNotesSort('asc')}
              >
                Oldest
              </ContextMenu.Item>
            </ContextMenu.SubMenu>
          </ContextMenu.Item>
        </>
      ) : null}
    </>
  );
});
