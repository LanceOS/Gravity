import React from 'react';
import type { Ticket } from '../../../context/TicketContext';
import { Compass } from 'lucide-react';
import { TicketRow } from './TicketRow';
import { TicketRowMobile } from './TicketRowMobile/TicketRowMobile';
import { TicketContextMenu } from './TicketContextMenu';

import type { TicketListProps } from '../types/TicketList';
import { getAssigneeAvatar, getPriorityIcon, getStatusLabel, getStatusColor } from '../utils/TicketList';
import { LIST_STATUS_ORDER } from '../utils/ticketView';

export const TicketList: React.FC<TicketListProps> = ({
  filteredCount,
  groupedTickets,
  availableTickets,
  labelById,
  userAvatarById,
  projectById,
  onSelectTicket,
}) => {

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, overflow: 'hidden' }}>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <>
          {LIST_STATUS_ORDER.map((status) => {
            const ticketsInGroup = groupedTickets[status];
            if (!ticketsInGroup || ticketsInGroup.length === 0) return null;
            return (
              <div key={status} style={{ marginBottom: '24px' }}>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--color-text-disabled)',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                    borderBottom: '1px solid var(--color-border-default)',
                    paddingBottom: '4px'
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: getStatusColor(status as Ticket['status']),
                      flexShrink: 0
                    }}
                  />
                  <span>{getStatusLabel(status as Ticket['status'])}</span>
                  <span style={{ background: 'var(--color-border-default)', padding: '1px 5px', borderRadius: '4px', fontSize: '10px' }}>
                    {ticketsInGroup.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {ticketsInGroup.map(ticket => {
                    const project = projectById?.[ticket.projectId];
                    const rowProps = {
                      ticket,
                      onClick: onSelectTicket,
                      priorityIcon: getPriorityIcon(ticket.priority),
                      assigneeAvatar: getAssigneeAvatar(userAvatarById, ticket.assigneeId),
                      projectName: project?.name,
                      projectColor: undefined as string | undefined,
                    };
                    return (
                      <React.Fragment key={ticket.id}>
                        <div className="ticket-list__row-desktop">
                          <TicketContextMenu ticket={ticket} availableTickets={availableTickets}>
                            <TicketRow {...rowProps} />
                          </TicketContextMenu>
                        </div>
                        <div className="ticket-list__row-mobile">
                          <TicketRowMobile {...rowProps} />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>

              </div>
            );
          })}

          {filteredCount === 0 && (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-disabled)' }}>
              <Compass size={48} style={{ strokeWidth: 1, marginBottom: '12px', color: 'var(--color-border-focus)' }} />
              <div>No tickets match your active filters.</div>
            </div>
          )}
        </>
      </div>

    </div>
  );
};
