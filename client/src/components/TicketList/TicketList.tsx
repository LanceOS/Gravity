import type { Ticket } from '../../context/TicketContext';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Compass } from 'lucide-react';
import { TicketRow } from './components';
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
      <div 
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'var(--sidebar-bg)'
        }}
      >
        {/* Search */}
        <input 
          type="text"
          className="input"
          placeholder="Filter tickets by title, body, or ID..."
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
          style={{ maxWidth: '300px' }}
        />

        {/* Priority Filter */}
        <Select
          value={filters.priority}
          onValueChange={(priority) => onFilterChange({ priority })}
          options={PRIORITY_FILTER_OPTIONS}
          ariaLabel="Filter list by priority"
          style={{ width: '120px' }}
        />

        {/* Status Filter */}
        <Select
          value={filters.status}
          onValueChange={(status) => onFilterChange({ status })}
          options={STATUS_FILTER_OPTIONS}
          ariaLabel="Filter list by status"
          style={{ width: '120px' }}
        />

        <Select
          value={listSort}
          onValueChange={(sort) => onListSortChange(sort as typeof listSort)}
          options={LIST_SORT_OPTIONS}
          ariaLabel="Sort list tickets"
          style={{ width: '140px' }}
        />

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            onClick={onClearFilters}
            variant="accent"
            size="sm"
          >
            Clear Filters
          </Button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
          {filteredCount} of {totalCount} tickets
        </div>
      </div>

      {/* Main Rows Scrolling Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
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
      </div>

    </div>
  );
};
