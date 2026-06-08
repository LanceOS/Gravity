import React from 'react';
import { Filter } from 'lucide-react';
import type { Ticket } from '../../../context/TicketContext';
import type { TicketFilters, TicketListSort } from '../utils/ticketView';
import { Button, Select, DenseTextInput, Popover, Badge } from '@library';
import {
  PRIORITY_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  LIST_SORT_OPTIONS,
} from '../utils/TicketList';
import type { TicketFilterBarProps } from '../types/TicketFilterBar';
import './TicketFilterBar.css';

export const TicketFilterBar: React.FC<TicketFilterBarProps> = ({
  filters,
  onFilterChange,
  hasActiveFilters,
  onClearFilters,
  filteredCount,
  totalCount,
  listSort,
  onListSortChange,
  domains,
  cycles,
  users,
}) => {
  const activeCount = [
    filters.priority,
    filters.status,
    filters.domainId,
    filters.cycleId,
    filters.assigneeId,
  ].filter(Boolean).length;

  const hasActivePopoverFilters = activeCount > 0;

  const handleClearPopoverFilters = () => {
    onFilterChange({
      priority: '',
      status: '',
      domainId: '',
      cycleId: '',
      assigneeId: '',
    });
  };

  const popoverContent = (
    <div className="ticket-filter-bar__popover">
      <div className="ticket-filter-bar__popover-header">
        <span className="ticket-filter-bar__popover-title">Filters</span>
        {hasActivePopoverFilters && (
          <Button onClick={handleClearPopoverFilters} variant="ghost" size="sm">
            Clear
          </Button>
        )}
      </div>
      <div className="ticket-filter-bar__grid">
        <div className="ticket-filter-bar__field">
          <span className="ticket-filter-bar__label">Priority</span>
          <Select
            value={filters.priority}
            onValueChange={(priority: string) => onFilterChange({ priority: priority as Ticket['priority'] | '' })}
            options={PRIORITY_FILTER_OPTIONS}
            aria-label="Filter list by priority"
          />
        </div>

        <div className="ticket-filter-bar__field">
          <span className="ticket-filter-bar__label">Status</span>
          <Select
            value={filters.status}
            onValueChange={(status: string) => onFilterChange({ status: status as Ticket['status'] | '' })}
            options={STATUS_FILTER_OPTIONS}
            aria-label="Filter list by status"
          />
        </div>

        {domains && domains.length > 0 && (
          <div className="ticket-filter-bar__field">
            <span className="ticket-filter-bar__label">Domain</span>
            <Select
              value={filters.domainId || ''}
              onValueChange={(domainId: string) => onFilterChange({ domainId })}
              options={[
                { label: 'Any Domain', value: '' },
                ...domains.map((d) => ({ label: d.name, value: d.id }))
              ]}
              aria-label="Filter list by domain"
            />
          </div>
        )}

        {cycles && cycles.length > 0 && (
          <div className="ticket-filter-bar__field">
            <span className="ticket-filter-bar__label">Cycle</span>
            <Select
              value={filters.cycleId || ''}
              onValueChange={(cycleId: string) => onFilterChange({ cycleId })}
              options={[
                { label: 'Any Cycle', value: '' },
                ...cycles.map((c) => ({ label: c.name, value: c.id }))
              ]}
              aria-label="Filter list by cycle"
            />
          </div>
        )}

        {users && users.length > 0 && (
          <div className="ticket-filter-bar__field">
            <span className="ticket-filter-bar__label">Assignee</span>
            <Select
              value={filters.assigneeId || ''}
              onValueChange={(assigneeId: string) => onFilterChange({ assigneeId })}
              options={[
                { label: 'Any Assignee', value: '' },
                ...users.map((u) => ({ label: u.name, value: u.id }))
              ]}
              aria-label="Filter list by assignee"
            />
          </div>
        )}

        {listSort !== undefined && onListSortChange !== undefined && (
          <div className="ticket-filter-bar__field">
            <span className="ticket-filter-bar__label">Sort</span>
            <Select
              value={listSort}
              onValueChange={(sort: string) => onListSortChange(sort as TicketListSort)}
              options={LIST_SORT_OPTIONS}
              aria-label="Sort list tickets"
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="ticket-filter-bar">
      {/* Search Input */}
      <div className="ticket-filter-bar__search">
        <DenseTextInput
          placeholder="Search tickets by title, body, ID, or branch..."
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
        />
      </div>

      {/* Filter Button with Popover */}
      <div className="ticket-filter-bar__actions">
        <Popover
          trigger={
            <Button variant="secondary" size="md" className="ticket-filter-bar__filter-btn">
              <Filter size={16} />
              <span>Filter</span>
              {activeCount > 0 && (
                <Badge variant="accent" style={{ marginLeft: 4 }}>
                  {activeCount}
                </Badge>
              )}
            </Button>
          }
        >
          {popoverContent}
        </Popover>

        {/* Metrics */}
        <span className="ticket-filter-bar__count">
          {filteredCount} of {totalCount} tickets
        </span>
      </div>
    </div>
  );
};
