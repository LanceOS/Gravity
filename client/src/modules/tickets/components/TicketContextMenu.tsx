import React, { useContext, useMemo } from 'react';
import { TicketContext, type Ticket } from '../../../context/TicketContext';
import { ContextMenu, toast } from '@library';
import {
  Check,
  User,
  Folder,
  Tag,
  AlertCircle,
  CheckSquare,
  Trash2,
  Calendar,
} from 'lucide-react';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../utils/TicketDetail';
import { getPriorityIcon } from '../utils/TicketBoard';

interface TicketContextMenuProps {
  ticket: Ticket;
  children: React.ReactNode;
}

export const TicketContextMenu: React.FC<TicketContextMenuProps> = ({ ticket, children }) => {
  const context = useContext(TicketContext);

  if (!context) {
    return <>{children}</>;
  }

  const {
    users,
    projects,
    labels,
    cycles,
    updateTicket,
    moveTicket,
    deleteTicket,
    assignLabelToTicket,
    unassignLabelFromTicket,
  } = context;

  const ticketLabels = useMemo(
    () => labels.filter((l) => l.projectId === ticket.projectId || !l.projectId),
    [labels, ticket.projectId]
  );

  const workspaceProjects = useMemo(() => {
    const currentProject = projects.find((p) => p.id === ticket.projectId);
    return currentProject?.workspaceId
      ? projects.filter((p) => p.workspaceId === currentProject.workspaceId)
      : projects;
  }, [projects, ticket.projectId]);

  const menuContent = (
    <>
      {/* 1. Status Submenu */}
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

      {/* 2. Priority Submenu */}
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

      {/* 3. Assignee Submenu */}
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

      {/* 4. Project Submenu */}
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

      {/* 5. Labels Submenu */}
      <ContextMenu.Item icon={<Tag size={13} style={{ color: 'var(--color-text-disabled)' }} />}>
        Labels
        <ContextMenu.SubMenu>
          {ticketLabels.length === 0 ? (
            <ContextMenu.Item disabled>No labels available</ContextMenu.Item>
          ) : (
            ticketLabels.map((l) => {
              const isAssigned = ticket.labels?.some((assigned) => assigned.id === l.id) || false;
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

      {/* 6. Cycle Submenu */}
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

      {/* Divider */}
      <div className="lib-divider" style={{ margin: '4px 0' }} />

      {/* 7. Delete Option */}
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
