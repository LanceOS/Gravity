import { PaginatedPickerResults } from './PaginatedPickerResults';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenu } from '@library';
import type { Ticket } from '../../../context/TicketContextContext';
import { buildSearchableText, normalizeSearchTerm } from '../../../utils/search';

export interface TicketAssignmentSubMenuProps {
  title: string;
  description: string;
  searchPlaceholder: string;
  tickets: Ticket[];
  emptyStateLabel: string;
  onSelectTicket: (ticket: Ticket) => void | Promise<void>;
}

export function TicketAssignmentSubMenu({
  title,
  description,
  searchPlaceholder,
  tickets,
  emptyStateLabel,
  onSelectTicket,
}: TicketAssignmentSubMenuProps) {
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const indexedTickets = useMemo(() => {
    return tickets.map((ticket) => ({
      ticket,
      searchableText: buildSearchableText([ticket.key, ticket.title]),
    }));
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = normalizeSearchTerm(search);
    if (!normalizedSearch) {
      return indexedTickets.map((entry) => entry.ticket);
    }

    return indexedTickets
      .filter((entry) => entry.searchableText.includes(normalizedSearch))
      .map((entry) => entry.ticket);
  }, [indexedTickets, search]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  return (
    <div data-ticket-picker onKeyDown={(event) => { if (event.key === 'Tab') event.stopPropagation(); }} style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '280px', maxWidth: '320px', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '2px 2px 0' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 650,
            color: 'var(--color-text-disabled)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          {description}
        </div>
      </div>

      <input
        ref={searchInputRef}
        type="text"
        placeholder={searchPlaceholder}
        aria-label={title}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            event.currentTarget.parentElement?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
          }
          if (event.key.startsWith('Arrow')) {
            event.stopPropagation();
          }
        }}
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '12px',
          background: 'var(--color-base50)',
          border: '1px solid var(--color-border-default)',
          borderRadius: '4px',
          color: 'var(--color-text-primary)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      <PaginatedPickerResults items={filteredTickets} maxHeight={220} emptyLabel={emptyStateLabel} menu>
          {(ticket) => (
            <ContextMenu.Item
              key={ticket.id}
              onClick={() => {
                void onSelectTicket(ticket);
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {ticket.key}
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {ticket.title}
                </span>
              </span>
            </ContextMenu.Item>
          )}
      </PaginatedPickerResults>
    </div>
  );
}
