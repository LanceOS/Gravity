import React from 'react';
import type { Ticket } from '../../../context/TicketContext';
import type { TicketFilters, TicketListSort } from '../utils/ticketView';
import { Button, Select, DenseTextInput, Accordion } from '@library';
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
}) => {
  const activeCount = [
    filters.search,
    filters.priority,
    filters.status,
    filters.domainId,
  ].filter(Boolean).length;

  const filterTitle = activeCount > 0
    ? `Filters (${activeCount} active)`
    : 'Filters';

  const accordionContent = (
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

      {hasActiveFilters && (
        <div className="ticket-filter-bar__field ticket-filter-bar__field--clear">
          <span className="ticket-filter-bar__label">&nbsp;</span>
          <Button onClick={onClearFilters} variant="accent" size="md">
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="ticket-filter-bar">

      {/* Row 1: Search */}
      <div className="ticket-filter-bar__search">
        <DenseTextInput
          placeholder="Search tickets by title, body, ID, or branch..."
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
        />
      </div>

      {/* Row 2: Filter accordion */}
      <div className="ticket-filter-bar__accordion-wrap">
        <Accordion
          items={[{ id: 'filters', title: filterTitle, content: accordionContent }]}
        />
      </div>

      {/* Row 3: Metrics */}
      <div className="ticket-filter-bar__metrics">
        <span className="ticket-filter-bar__count">
          {filteredCount} of {totalCount} tickets
        </span>
      </div>
    </div>
  );
};
