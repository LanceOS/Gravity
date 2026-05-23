import React from 'react';
import type { Ticket } from '../../context/TicketContext';
import { Button, Select, DenseTextInput } from '@library';
import {
  PRIORITY_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  LIST_SORT_OPTIONS,
} from '../TicketList/utils';

type TicketFilterBarFilters = {
  search: string;
  priority: Ticket['priority'] | '';
  status: Ticket['status'] | '';
  projectId?: string;
  domainId?: string;
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
  domains?: Domain[];
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
  domains,
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
        style={{ maxWidth: '300px' }}
      />

      {/* Priority Filter */}
      <Select
        value={filters.priority}
        onValueChange={(priority: string) => onFilterChange({ priority: priority as Ticket['priority'] | '' })}
        options={PRIORITY_FILTER_OPTIONS}
        aria-label="Filter list by priority"
        style={{ width: 'fit-content' }}
      />

      {/* Status Filter */}
      <Select
        value={filters.status}
        onValueChange={(status: string) => onFilterChange({ status: status as Ticket['status'] | '' })}
        options={STATUS_FILTER_OPTIONS}
        aria-label="Filter list by status"
        style={{ width: 'fit-content' }}
      />

      {/* Domain Filter */}
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

      {/* List Sort */}
      {listSort !== undefined && onListSortChange !== undefined && (
        <Select
          value={listSort}
          onValueChange={(sort: string) => onListSortChange(sort)}
          options={LIST_SORT_OPTIONS}
          aria-label="Sort list tickets"
          style={{ width: 'fit-content' }}
        />
      )}

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <Button
          onClick={onClearFilters}
          variant="accent"
          size="md"
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
