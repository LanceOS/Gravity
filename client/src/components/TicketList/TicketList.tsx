import React from 'react';
import type { Ticket } from '../../context/TicketContext';
import { Button, Select, DenseTextInput } from '@library';
import { Compass } from 'lucide-react';
import { TicketRow } from './components';
import { TicketFilterBar } from '../TicketFilterBar';
import type { TicketListProps } from './types';
import { getAssigneeAvatar, getDomainTag, getPriorityIcon, getStatusLabel, LIST_SORT_OPTIONS, PRIORITY_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from './utils';

export const TicketList: React.FC<TicketListProps> = ({
  filters,
  filteredCount,
  totalCount,
  groupedTickets,
  listSort,
  domainById,
  userAvatarById,
  hasActiveFilters,
  onFilterChange,
  onClearFilters,
  onListSortChange,
  onSelectTicket,
}) => {


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, overflow: 'hidden' }}>

      {/* Filtering Header Bar */}
      <TicketFilterBar
        filters={filters as any}
        onFilterChange={onFilterChange}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={onClearFilters}
        filteredCount={filteredCount}
        totalCount={totalCount}
        listSort={listSort}
        onListSortChange={onListSortChange}
      />

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
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: '4px'
                  }}
                >
                  <span>{getStatusLabel(status as Ticket['status'])}</span>
                  <span style={{ background: 'var(--border)', padding: '1px 5px', borderRadius: '4px', fontSize: '10px' }}>
                    {ticketsInGroup.length}
                  </span>
                </div>

                {/* Rows List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
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
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Compass size={48} style={{ strokeWidth: 1, marginBottom: '12px', color: 'var(--border-focus)' }} />
              <div>No tickets match your active filters.</div>
            </div>
          )}
        </>
      </div>

    </div>
  );
};
