import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenu } from '@library';
import type { Ticket } from '../../../context/TicketContext';

export interface TicketAssignmentSubMenuProps {
  title: string;
  description: string;
  searchPlaceholder: string;
  tickets: Ticket[];
  emptyStateLabel: string;
  onSelectTicket: (ticket: Ticket) => void | Promise<void>;
}

function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase();
}

function buildSearchableText(ticket: Ticket) {
  return [ticket.key, ticket.title].filter(Boolean).join(' ').toLowerCase();
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

  const filteredTickets = useMemo(() => {
    const normalizedSearch = normalizeSearchTerm(search);
    if (!normalizedSearch) {
      return tickets;
    }

    return tickets.filter((ticket) => buildSearchableText(ticket).includes(normalizedSearch));
  }, [search, tickets]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '280px', maxWidth: '320px' }}>
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

      <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '2px' }}>
        {filteredTickets.length > 0 ? (
          filteredTickets.map((ticket) => (
            <ContextMenu.Item
              key={ticket.id}
              onClick={() => {
                void onSelectTicket(ticket);
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ticket.key}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ticket.title}
                </span>
              </span>
            </ContextMenu.Item>
          ))
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', textAlign: 'center', padding: '8px 0' }}>
            {emptyStateLabel}
          </div>
        )}
      </div>
    </div>
  );
}
