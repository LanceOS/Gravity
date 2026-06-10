import React, { useMemo, useContext } from 'react';
import { TicketContext, type Ticket } from '../../../context/TicketContext';
import { ContextMenu, type ContextMenuItem } from '@library';
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

  const menuItems = useMemo((): ContextMenuItem[] => {
    if (!context) return [];
    const { 
      users, 
      projects, 
      labels, 
      cycles, 
      updateTicket, 
      deleteTicket,
      assignLabelToTicket,
      unassignLabelFromTicket
    } = context;
    // 1. Status Submenu
    const statusSubmenu: ContextMenuItem[] = STATUS_OPTIONS.map((opt) => {
      const isActive = ticket.status === opt.value;
      return {
        label: opt.label,
        icon: isActive ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />,
        onClick: () => {
          if (!isActive) {
            updateTicket(ticket.id, { status: opt.value as Ticket['status'] });
          }
        }
      };
    });

    // 2. Priority Submenu
    const prioritySubmenu: ContextMenuItem[] = PRIORITY_OPTIONS.map((opt) => {
      const isActive = ticket.priority === opt.value;
      return {
        label: opt.label,
        icon: (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isActive ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
            {getPriorityIcon(opt.value as Ticket['priority'])}
          </div>
        ),
        onClick: () => {
          if (!isActive) {
            updateTicket(ticket.id, { priority: opt.value as Ticket['priority'] });
          }
        }
      };
    });

    // 3. Assignee Submenu
    const assigneeSubmenu: ContextMenuItem[] = [
      {
        label: 'Unassigned',
        icon: !ticket.assigneeId ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />,
        onClick: () => {
          if (ticket.assigneeId !== null) {
            updateTicket(ticket.id, { assigneeId: null });
          }
        }
      },
      ...users.map((u) => {
        const isActive = ticket.assigneeId === u.id;
        return {
          label: u.name,
          icon: (
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
          ),
          onClick: () => {
            if (!isActive) {
              updateTicket(ticket.id, { assigneeId: u.id });
            }
          }
        };
      })
    ];

    // 4. Project Submenu
    const projectSubmenu: ContextMenuItem[] = projects.map((p) => {
      const isActive = ticket.projectId === p.id;
      return {
        label: p.name,
        icon: isActive ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />,
        onClick: () => {
          if (!isActive) {
            updateTicket(ticket.id, { projectId: p.id });
          }
        }
      };
    });

    // 5. Labels Submenu
    const labelSubmenu: ContextMenuItem[] = labels
      .filter((l) => l.projectId === ticket.projectId)
      .map((l) => {
        const isAssigned = ticket.labels?.some((assigned) => assigned.id === l.id) || false;
        return {
          label: l.name,
          icon: (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isAssigned ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />}
              <div 
                style={{ 
                  width: '6px', 
                  height: '6px', 
                  borderRadius: '50%', 
                  backgroundColor: l.color || '#6B7280' 
                }} 
              />
            </div>
          ),
          onClick: async () => {
            if (isAssigned) {
              await unassignLabelFromTicket(ticket.id, l.id);
            } else {
              await assignLabelToTicket(ticket.id, l.id);
            }
          }
        };
      });

    // 6. Cycle Submenu
    const cycleSubmenu: ContextMenuItem[] = [
      {
        label: 'No Cycle',
        icon: !ticket.cycleId ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />,
        onClick: () => {
          if (ticket.cycleId !== null) {
            updateTicket(ticket.id, { cycleId: null });
          }
        }
      },
      ...cycles.map((c) => {
        const isActive = ticket.cycleId === c.id;
        return {
          label: c.name,
          icon: isActive ? <Check size={12} style={{ color: 'var(--color-primary)' }} /> : <div style={{ width: 12 }} />,
          onClick: () => {
            if (!isActive) {
              updateTicket(ticket.id, { cycleId: c.id });
            }
          }
        };
      })
    ];

    return [
      {
        label: 'Change Status',
        icon: <CheckSquare size={13} style={{ color: 'var(--color-text-disabled)' }} />,
        children: statusSubmenu
      },
      {
        label: 'Change Priority',
        icon: <AlertCircle size={13} style={{ color: 'var(--color-text-disabled)' }} />,
        children: prioritySubmenu
      },
      {
        label: 'Assign Member',
        icon: <User size={13} style={{ color: 'var(--color-text-disabled)' }} />,
        children: assigneeSubmenu
      },
      {
        label: 'Move to Project',
        icon: <Folder size={13} style={{ color: 'var(--color-text-disabled)' }} />,
        children: projectSubmenu
      },
      {
        label: 'Labels',
        icon: <Tag size={13} style={{ color: 'var(--color-text-disabled)' }} />,
        children: labelSubmenu
      },
      {
        label: 'Assign Cycle',
        icon: <Calendar size={13} style={{ color: 'var(--color-text-disabled)' }} />,
        children: cycleSubmenu
      },
      {
        label: 'Delete Ticket',
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => {
          if (window.confirm(`Are you sure you want to delete ${ticket.key}?`)) {
            deleteTicket(ticket.id);
          }
        }
      }
    ];
  }, [ticket, context]);

  if (!context) {
    return <>{children}</>;
  }

  return (
    <ContextMenu items={menuItems}>
      {children}
    </ContextMenu>
  );
};
