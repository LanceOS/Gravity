import React, { useContext, useMemo } from 'react';
import { TicketContext, type Label, type Ticket } from '../../../context/TicketContext';
import { ContextMenu, toast } from '@library';
import { Check, User, Folder, Tag, AlertCircle, CheckSquare, Trash2, Calendar, Link } from 'lucide-react';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../utils/TicketDetail';
import { getPriorityIcon } from '../utils/TicketBoard';
import { TicketAssignmentSubMenu } from './TicketAssignmentSubMenu';

const EMPTY_TICKETS: Ticket[] = [];
const EMPTY_USER_IDS: string[] = [];
const EMPTY_LABELS: Label[] = [];

interface TicketContextMenuProps {
  ticket: Ticket;
  children: React.ReactNode;
  availableTickets?: Ticket[];
}

export const TicketContextMenu: React.FC<TicketContextMenuProps> = ({ ticket, children, availableTickets }) => {
  const context = useContext(TicketContext);
  if (!context) {
    return <>{children}</>;
  }

  const {
    tickets,
    users,
    cycles,
    projectById,
    labelsByProject,
    globalLabels,
    projectsByWorkspaceId,
    projects,
    ticketsByProject,
    updateTicket,
    moveTicket,
    deleteTicket,
    addTicketDependency,
    addTicketBlocker,
    assignLabelToTicket,
    unassignLabelFromTicket,
  } = context;
  const sourceTickets = availableTickets ?? tickets;
  const safeLabelsByProject = labelsByProject ?? new Map<string, Label[]>();
  const safeTicketsByProject = ticketsByProject ?? new Map<string, Ticket[]>();
  const safeGlobalLabels = globalLabels ?? EMPTY_LABELS;

  const ticketLabels = useMemo(() => {
    const projectLabels = safeLabelsByProject.get(ticket.projectId);
    if (safeGlobalLabels.length === 0) {
      return projectLabels || EMPTY_LABELS;
    }
    if (!projectLabels || projectLabels.length === 0) {
      return safeGlobalLabels;
    }
    return [...safeGlobalLabels, ...projectLabels];
  }, [safeGlobalLabels, safeLabelsByProject, ticket.projectId]);

  const assignableTickets = useMemo(() => {
    const projectTickets = availableTickets
      ? sourceTickets.filter((candidate) => candidate.projectId === ticket.projectId)
      : safeTicketsByProject.get(ticket.projectId) || EMPTY_TICKETS;
    if (!projectTickets.length) {
      return EMPTY_TICKETS;
    }
    return projectTickets.filter((candidate) => candidate.id !== ticket.id);
  }, [availableTickets, safeTicketsByProject, sourceTickets, ticket.id, ticket.projectId]);

  const workspaceProjects = useMemo(() => {
    const ticketProject = projectById.get(ticket.projectId);
    if (!ticketProject?.workspaceId) {
      return projects;
    }

    return projectsByWorkspaceId.get(ticketProject.workspaceId) || projects;
  }, [projectById, projects, projectsByWorkspaceId, ticket.projectId]);

  const assignedLabelIds = useMemo(() => new Set(ticket.labels?.map((assignedLabel) => assignedLabel.id) || EMPTY_USER_IDS), [ticket.labels]);

  const menuContent = (
    <>
      <ContextMenu.Item icon={<CheckSquare size={13} style={{ color: 'var(--color-text-disabled)' }} />}>
        Change Status
        <ContextMenu.SubMenu>
          {STATUS_OPTIONS.map((opt) => {
            const isActive = ticket.status === opt.value;
            return (
              <ContextMenu.Item
                key={opt.value}
                icon={isActive ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                onClick={async () => {
                  if (!isActive) {
                    await updateTicket(ticket.id, { status: opt.value as Ticket['status'] });
                    toast.show(`Status updated to ${opt.label}`, 'success');
                  }
                }}
              >
                {opt.label}
              </ContextMenu.Item>
            );
          })}
        </ContextMenu.SubMenu>
      </ContextMenu.Item>

      <ContextMenu.Item icon={<AlertCircle size={13} style={{ color: 'var(--color-text-disabled)' }} />}>
        Change Priority
        <ContextMenu.SubMenu>
          {PRIORITY_OPTIONS.map((opt) => {
            const isActive = ticket.priority === opt.value;
            return (
              <ContextMenu.Item
                key={opt.value}
                icon={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isActive ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                    {getPriorityIcon(opt.value as Ticket['priority'])}
                  </div>
                }
                onClick={async () => {
                  if (!isActive) {
                    await updateTicket(ticket.id, { priority: opt.value as Ticket['priority'] });
                    toast.show(`Priority updated to ${opt.label}`, 'success');
                  }
                }}
              >
                {opt.label}
              </ContextMenu.Item>
            );
          })}
        </ContextMenu.SubMenu>
      </ContextMenu.Item>

      <ContextMenu.Item icon={<User size={13} style={{ color: 'var(--color-text-disabled)' }} />}>
        Assign Member
        <ContextMenu.SubMenu>
          <ContextMenu.Item
            icon={!ticket.assigneeId ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
            onClick={async () => {
              if (ticket.assigneeId !== null) {
                await updateTicket(ticket.id, { assigneeId: null });
                toast.show('Ticket unassigned', 'success');
              }
            }}
          >
            Unassigned
          </ContextMenu.Item>
          {users.map((u) => {
            const isActive = ticket.assigneeId === u.id;
            return (
              <ContextMenu.Item
                key={u.id}
                icon={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isActive ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                    {u.avatar ? (
                      <img
                        src={u.avatar}
                        alt=""
                        style={{ width: '14px', height: '14px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : null}
                  </div>
                }
                onClick={async () => {
                  if (!isActive) {
                    await updateTicket(ticket.id, { assigneeId: u.id });
                    toast.show(`Assigned to ${u.name}`, 'success');
                  }
                }}
              >
                {u.name}
              </ContextMenu.Item>
            );
          })}
        </ContextMenu.SubMenu>
      </ContextMenu.Item>

      <ContextMenu.Item icon={<Folder size={13} style={{ color: 'var(--color-text-disabled)' }} />}>
        Move to Project
        <ContextMenu.SubMenu>
          {workspaceProjects.length === 0 ? (
            <ContextMenu.Item disabled>No projects available</ContextMenu.Item>
          ) : (
            workspaceProjects.map((p) => {
              const isActive = ticket.projectId === p.id;
              return (
                <ContextMenu.Item
                  key={p.id}
                  icon={isActive ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                  onClick={async () => {
                    if (!isActive) {
                      const moved = await moveTicket(ticket.id, ticket.projectId, p.id);
                      if (moved) {
                        toast.show(`Moved to project ${p.name}`, 'success');
                      }
                    }
                  }}
                >
                  {p.name}
                </ContextMenu.Item>
              );
            })
          )}
        </ContextMenu.SubMenu>
      </ContextMenu.Item>

      <ContextMenu.Item icon={<Tag size={13} style={{ color: 'var(--color-text-disabled)' }} />}>
        Labels
        <ContextMenu.SubMenu>
          {ticketLabels.length === 0 ? (
            <ContextMenu.Item disabled>No labels available</ContextMenu.Item>
          ) : (
            ticketLabels.map((l) => {
              const isAssigned = assignedLabelIds.has(l.id);
              return (
                <ContextMenu.Item
                  key={l.id}
                  closeOnClick={false}
                  icon={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isAssigned ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                      <div
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: l.color || '#6B7280',
                        }}
                      />
                    </div>
                  }
                  onClick={async () => {
                    if (isAssigned) {
                      await unassignLabelFromTicket(ticket.id, l.id);
                      toast.show(`Removed label: ${l.name}`, 'success');
                    } else {
                      await assignLabelToTicket(ticket.id, l.id);
                      toast.show(`Added label: ${l.name}`, 'success');
                    }
                  }}
                >
                  {l.name}
                </ContextMenu.Item>
              );
            })
          )}
        </ContextMenu.SubMenu>
      </ContextMenu.Item>

      <ContextMenu.Item icon={<Calendar size={13} style={{ color: 'var(--color-text-disabled)' }} />}>
        Assign Cycle
        <ContextMenu.SubMenu>
          <ContextMenu.Item
            icon={!ticket.cycleId ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
            onClick={async () => {
              if (ticket.cycleId !== null) {
                await updateTicket(ticket.id, { cycleId: null });
                toast.show('Removed from cycle', 'success');
              }
            }}
          >
            No Cycle
          </ContextMenu.Item>
          {cycles.map((c) => {
            const isActive = ticket.cycleId === c.id;
            return (
              <ContextMenu.Item
                key={c.id}
                icon={isActive ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
                onClick={async () => {
                  if (!isActive) {
                    await updateTicket(ticket.id, { cycleId: c.id });
                    toast.show(`Assigned to cycle ${c.name}`, 'success');
                  }
                }}
              >
                {c.name}
              </ContextMenu.Item>
            );
          })}
        </ContextMenu.SubMenu>
      </ContextMenu.Item>

      <ContextMenu.Item icon={<Link size={13} style={{ color: 'var(--color-text-disabled)' }} />}>
        Assign As
        <ContextMenu.SubMenu>
          <ContextMenu.Item>
            Dependency
            <ContextMenu.SubMenu>
              <TicketAssignmentSubMenu
                title="Assign as Dependency"
                description="Choose the ticket this ticket should depend on."
                searchPlaceholder="Type to search tickets..."
                tickets={assignableTickets}
                emptyStateLabel="No matching tickets"
                onSelectTicket={async (selectedTicket) => {
                  const success = await addTicketDependency(ticket.id, selectedTicket.id);
                  if (success) {
                    toast.show(`${ticket.key} now depends on ${selectedTicket.key}`, 'success');
                  } else {
                    toast.show(`Failed to assign ${selectedTicket.key} as a dependency`, 'error');
                  }
                }}
              />
            </ContextMenu.SubMenu>
          </ContextMenu.Item>

          <ContextMenu.Item>
            Blocker
            <ContextMenu.SubMenu>
              <TicketAssignmentSubMenu
                title="Assign as Blocker"
                description="Choose the ticket that should block this ticket."
                searchPlaceholder="Type to search tickets..."
                tickets={assignableTickets}
                emptyStateLabel="No matching tickets"
                onSelectTicket={async (selectedTicket) => {
                  const success = await addTicketBlocker(ticket.id, selectedTicket.id);
                  if (success) {
                    toast.show(`${selectedTicket.key} now blocks ${ticket.key}`, 'success');
                  } else {
                    toast.show(`Failed to assign ${selectedTicket.key} as a blocker`, 'error');
                  }
                }}
              />
            </ContextMenu.SubMenu>
          </ContextMenu.Item>
        </ContextMenu.SubMenu>
      </ContextMenu.Item>

      <div className="lib-divider" style={{ margin: '4px 0' }} />

      <ContextMenu.Item
        danger
        icon={<Trash2 size={13} />}
        onClick={async () => {
          if (window.confirm(`Are you sure you want to delete ${ticket.key}?`)) {
            await deleteTicket(ticket.id);
            toast.show('Ticket deleted successfully', 'success');
          }
        }}
      >
        Delete Ticket
      </ContextMenu.Item>
    </>
  );

  return (
    <ContextMenu.Root content={menuContent}>
      {children}
    </ContextMenu.Root>
  );
};
