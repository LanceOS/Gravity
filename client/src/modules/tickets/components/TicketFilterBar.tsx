import React from 'react';
import type { Ticket } from '../../../context/TicketContext';
import type { TicketFilters, TicketListSort } from '../utils/ticketView';
import { Button, Select, DenseTextInput } from '@library';
import {
  PRIORITY_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  LIST_SORT_OPTIONS,
} from '../utils/TicketList';
import type { TicketFilterBarProps } from '../types/TicketFilterBar';


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
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
      }}
    >
      <DenseTextInput
        placeholder="Filter tickets by title, body, or ID..."
        value={filters.search}
        onChange={(e) => onFilterChange({ search: e.target.value })}
        style={{ maxWidth: '300px' }}
      />

      <Select
        value={filters.priority}
        onValueChange={(priority: string) => onFilterChange({ priority: priority as Ticket['priority'] | '' })}
        options={PRIORITY_FILTER_OPTIONS}
        aria-label="Filter list by priority"
        style={{ width: 'fit-content' }}
      />

      <Select
        value={filters.status}
        onValueChange={(status: string) => onFilterChange({ status: status as Ticket['status'] | '' })}
        options={STATUS_FILTER_OPTIONS}
        aria-label="Filter list by status"
        style={{ width: 'fit-content' }}
      />

      {domains && domains.length > 0 && (
        <Select
          value={filters.domainId || ''}
          onValueChange={(domainId: string) => onFilterChange({ domainId })}
          options={[
            { label: 'Any Domain', value: '' },
            ...domains.map((d) => ({ label: d.name, value: d.id }))
          ]}
          aria-label="Filter list by domain"
          style={{ width: 'fit-content' }}
        />
      )}

      {listSort !== undefined && onListSortChange !== undefined && (
        <Select
          value={listSort}
          onValueChange={(sort: string) => onListSortChange(sort as TicketListSort)}
          options={LIST_SORT_OPTIONS}
          aria-label="Sort list tickets"
          style={{ width: 'fit-content' }}
        />
      )}

      {hasActiveFilters && (
        <Button
          onClick={onClearFilters}
          variant="accent"
          size="md"
        >
          Clear Filters
        </Button>
      )}

      <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--color-text-disabled)' }}>
        {filteredCount} of {totalCount} tickets
      </div>
    </div>
  );
};
