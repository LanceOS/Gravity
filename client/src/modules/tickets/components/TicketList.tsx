import React from 'react';
import type { Ticket } from '../../../context/TicketContext';
import { Compass } from 'lucide-react';
import { TicketRow } from './TicketRow';

import type { TicketListProps } from '../types/TicketList';
import { getAssigneeAvatar, getDomainTag, getPriorityIcon, getStatusLabel, getStatusColor } from '../utils/TicketList';

export const TicketList: React.FC<TicketListProps> = ({
  filteredCount,
  groupedTickets,
  domainById,
  userAvatarById,
  onSelectTicket,
}) => {


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, overflow: 'hidden' }}>

      {/* Main Rows Scrolling Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        <>
          {Object.entries(groupedTickets).map(([status, ticketsInGroup]) => {
            if (ticketsInGroup.length === 0) return null;
            return (
              <div key={status} style={{ marginBottom: '24px' }}>

                {/* Group Title */}
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

                {/* Rows List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {ticketsInGroup.map(ticket => (
                    <TicketRow
                      key={ticket.id}
                      ticket={ticket}
                      onClick={() => onSelectTicket(ticket)}
                      priorityIcon={getPriorityIcon(ticket.priority)}
                      assigneeAvatar={getAssigneeAvatar(userAvatarById, ticket.assigneeId)}
                      domainTag={getDomainTag(domainById, ticket.domainId)}
                    />
                  ))}
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
