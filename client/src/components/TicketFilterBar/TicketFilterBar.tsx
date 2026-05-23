import React from 'react';
import type { Ticket } from '../../context/TicketContext';
import { Button, Select, DenseTextInput } from '@library';
import {
  PRIORITY_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from '../TicketList/utils';

const LIST_SORT_OPTIONS = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Priority: high to low', value: 'priority_desc' },
  { label: 'Priority: low to high', value: 'priority_asc' },
  { label: 'Updated recently', value: 'updated_desc' },
  { label: 'Least recently updated', value: 'updated_asc' },
];

type TicketFilterBarFilters = {
  search: string;
  priority: Ticket['priority'] | '';
  status: Ticket['status'] | '';
  projectId?: string;
};

export interface TicketFilterBarProps {
  filters: TicketFilterBarFilters;
  onFilterChange: (filters: Partial<TicketFilterBarFilters>) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  filteredCount: number;
  totalCount: number;
  listSort?: string;
  onListSortChange?: (sort: string) => void;
}

export const TicketFilterBar: React.FC<TicketFilterBarProps> = ({
  filters,
  onFilterChange,
  hasActiveFilters,
  onClearFilters,
  filteredCount,
  totalCount,
  listSort,
  onListSortChange,
}) => {
  return (
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
      <DenseTextInput
        placeholder="Filter tickets by title, body, or ID..."
        value={filters.search}
        onChange={(e) => onFilterChange({ search: e.target.value })}
        style={{ flex: 1, width: '100%', maxWidth: '300px' }}
      />

      {/* Priority Filter */}
      <Select
        value={filters.priority}
        onValueChange={(priority: string) => onFilterChange({ priority: priority as Ticket['priority'] | '' })}
        options={PRIORITY_FILTER_OPTIONS}
        aria-label="Filter list by priority"
      />

      {/* Status Filter */}
      <Select
        value={filters.status}
        onValueChange={(status: string) => onFilterChange({ status: status as Ticket['status'] | '' })}
        options={STATUS_FILTER_OPTIONS}
        aria-label="Filter list by status"
      />

      {/* List Sort */}
      {listSort !== undefined && onListSortChange !== undefined && (
        <Select
          value={listSort}
          onValueChange={(sort: string) => onListSortChange(sort)}
          options={LIST_SORT_OPTIONS}
          aria-label="Sort list tickets"
        />
      )}

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
  );
};
