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
  labels,
  domains,
  cycles,
  users,
}) => {
  const availableLabels = labels ?? domains ?? [];
  const selectedLabelIds = filters.labels ?? [];
  const activeCount = [
    filters.priority,
    filters.status,
    filters.labels && filters.labels.length > 0 ? 'labels' : '',
    filters.cycleId,
    filters.assigneeId,
  ].filter(Boolean).length;

  const hasActivePopoverFilters = activeCount > 0;

  const handleClearPopoverFilters = () => {
    onFilterChange({
      priority: '',
      status: '',
      labels: [],
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

        {availableLabels.length > 0 && (
          <div className="ticket-filter-bar__field" style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span className="ticket-filter-bar__label" style={{ marginBottom: 0 }}>Labels</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)' }}>Match:</span>
                <button
                  type="button"
                  onClick={() => onFilterChange({ labelMode: filters.labelMode === 'all' ? 'any' : 'all' })}
                  className="clickable"
                  style={{
                    background: filters.labelMode === 'all' ? 'rgba(59,130,246,0.15)' : 'var(--color-base100)',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: '4px',
                    color: filters.labelMode === 'all' ? '#3b82f6' : 'var(--color-text-secondary)',
                    padding: '1px 5px',
                    fontSize: '9px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  {filters.labelMode === 'all' ? 'ALL (AND)' : 'ANY (OR)'}
                </button>
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '6px',
                maxHeight: '120px',
                overflowY: 'auto',
                border: '1px solid var(--color-border-default)',
                borderRadius: '6px',
                padding: '8px',
                background: 'var(--color-base50)'
              }}
            >
              {availableLabels.map((l) => {
                const isChecked = filters.labels?.includes(l.id) || false;
                return (
                  <label
                    key={l.id}
                    className="clickable"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11px',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      background: isChecked ? 'rgba(255,255,255,0.03)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        const nextLabels = isChecked
                          ? selectedLabelIds.filter((id) => id !== l.id)
                          : [...selectedLabelIds, l.id];
                        onFilterChange({ labels: nextLabels });
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: l.color,
                        flexShrink: 0
                      }}
                    />
                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {l.name}
                    </span>
                  </label>
                );
              })}
            </div>
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
          align="right"
          contentClassName="ticket-filter-popover-content"
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
