import React from 'react';
import type { Ticket } from '../../../../../context/TicketContextContext';
import { Button } from '@library';
import { Plus } from 'lucide-react';
import { TicketRow } from '../../TicketRow';
import { TicketRowMobile } from '../../TicketRowMobile/TicketRowMobile';
import { getAssigneeAvatar } from '../../../utils/TicketList';

interface TicketSubtasksChecklistProps {
  activeTicket: Ticket;
  subtasks: Ticket[];
  completedSubtasks: number;
  subtaskProgressPercent: number;
  userAvatarById: Record<string, string>;
  isMobileTicketLayout: boolean;
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreateSubtask: (ticketId: string) => void;
}

export const TicketSubtasksChecklist: React.FC<TicketSubtasksChecklistProps> = ({
  activeTicket,
  subtasks,
  completedSubtasks,
  subtaskProgressPercent,
  userAvatarById,
  isMobileTicketLayout,
  onSelectTicket,
  onOpenCreateSubtask,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border-default)', paddingBottom: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>
          Sub-tasks Checklist
        </span>

        <Button
          onClick={() => onOpenCreateSubtask(activeTicket.id)}
          variant="ghost"
          size="sm"
          style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
        >
          <Plus size={12} />
          <span>Add Subtask</span>
        </Button>
      </div>

      {subtasks.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, height: '4px', background: 'var(--color-border-default)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${subtaskProgressPercent}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.2s ease' }} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)', whiteSpace: 'nowrap' }}>
              {completedSubtasks} of {subtasks.length} ({Math.round(subtaskProgressPercent)}%)
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {subtasks.map((sub) => {
              const rowProps = {
                ticket: sub,
                onClick: onSelectTicket,
                priority: sub.priority,
                assigneeAvatar: getAssigneeAvatar(userAvatarById, sub.assigneeId),
              };
              return (
                <React.Fragment key={sub.id}>
                  {isMobileTicketLayout ? (
                    <div className="ticket-list__row-mobile">
                      <TicketRowMobile {...rowProps} />
                    </div>
                  ) : (
                    <div className="ticket-list__row-desktop">
                      <TicketRow {...rowProps} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--color-text-disabled)', fontStyle: 'italic', padding: '8px 4px' }}>
          No sub-tasks defined. Break complex tasks down to improve trackability.
        </div>
      )}
    </div>
  );
};
