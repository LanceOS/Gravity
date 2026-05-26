import React, { useState, useDeferredValue, useTransition, useMemo } from 'react';
import type { Ticket, Domain } from '../../../context/TicketContext';
import { DenseVirtualList, DenseTextInput } from '@library';
import { getPriorityIcon } from '../utils/TicketList';

interface DenseGridControllerProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  userAvatarById: Record<string, string>;
  domainById: Record<string, Domain>;
}

export const DenseGridController: React.FC<DenseGridControllerProps> = ({
  tickets,
  onSelectTicket,
  userAvatarById,
  domainById,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPending] = useTransition();

  // Defer processing of search query to keep typing at 60 FPS
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const filteredTickets = useMemo(() => {
    if (!deferredSearchTerm) return tickets;
    const query = deferredSearchTerm.toLowerCase();
    return tickets.filter(
      (t) =>
        t.key.toLowerCase().includes(query) ||
        t.title.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query)
    );
  }, [deferredSearchTerm, tickets]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const getPriorityColor = (p: Ticket['priority']) => {
    switch (p) {
      case 'urgent': return 'var(--color-primary)';
      case 'high': return 'var(--color-text-primary)';
      case 'medium': return 'var(--color-text-secondary)';
      case 'low': return 'var(--color-base400)';
      default: return 'var(--color-text-disabled)';
    }
  };

  const getStatusLabel = (status: Ticket['status']) => {
    return status.replace(/_/g, ' ');
  };

  return (
    <div 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '8px', 
        height: '100%',
        minHeight: '400px',
        backgroundColor: 'var(--color-surface-card)'
      }}
    >
      {/* Search and Metadata Top Bar */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          padding: '4px 8px',
          borderBottom: '1px solid var(--color-border-default)'
        }}
      >
        <div style={{ flex: 1, maxWidth: '280px' }}>
          <DenseTextInput
            id="dense-grid-search"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search virtual grid..."
            aria-label="Filter database records"
          />
        </div>
        
        {isPending && (
          <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)' }}>
            Re-rendering pipeline...
          </span>
        )}
        
        <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-text-disabled)', fontFamily: 'var(--mono)' }}>
          {filteredTickets.length} of {tickets.length} virtual rows
        </div>
      </div>

      {/* Sticky Table Header */}
      <div
        style={{
          display: 'flex',
          backgroundColor: 'var(--color-base50)',
          borderBottom: '1px solid var(--color-border-default)',
          height: '26px',
          alignItems: 'center',
          fontWeight: 600,
          fontSize: '10px',
          color: 'var(--color-text-disabled)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          padding: '0 8px',
          userSelect: 'none'
        }}
      >
        <span style={{ width: '70px', padding: '0 8px' }}>ID</span>
        <span style={{ flex: 1, padding: '0 8px' }}>Title</span>
        <span style={{ width: '100px', padding: '0 8px' }}>Priority</span>
        <span style={{ width: '110px', padding: '0 8px' }}>Status</span>
        <span style={{ width: '90px', padding: '0 8px' }}>Assignee</span>
      </div>

      {/* Virtualized Scrollable Canvas */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {filteredTickets.length > 0 ? (
          <DenseVirtualList
            items={filteredTickets}
            height={420}
            rowHeight={28}
            buffer={8}
            renderRow={(t: Ticket, index: number, style: React.CSSProperties) => {
              const avatar = userAvatarById[t.assigneeId || ''];
              const domain = t.domainId ? domainById[t.domainId] : null;

              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTicket(t)}
                  role="row"
                  tabIndex={0}
                  style={{
                    ...style,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    borderBottom: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-surface-card)',
                    fontFamily: 'var(--mono)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'background-color var(--transition-fast)'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectTicket(t);
                    }
                  }}
                  className="dense-table-row"
                >
                  {/* ID Column */}
                  <span style={{ width: '70px', padding: '0 8px', color: 'var(--color-text-disabled)' }}>
                    {t.key}
                  </span>

                  {/* Title Column with optional Domain Tag */}
                  <span 
                    style={{ 
                      flex: 1, 
                      padding: '0 8px', 
                      fontWeight: 500, 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap', 
                      color: 'var(--color-text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {t.title}
                    {domain && (
                      <span
                        style={{
                          fontSize: '8px',
                          padding: '1px 4px',
                          borderRadius: '3px',
                          backgroundColor: `${domain.color}15`,
                          color: domain.color,
                          border: `1px solid ${domain.color}30`,
                          fontFamily: 'var(--sans)',
                          textTransform: 'uppercase',
                          fontWeight: 600
                        }}
                      >
                        {domain.name}
                      </span>
                    )}
                  </span>

                  {/* Priority Column */}
                  <span 
                    style={{ 
                      width: '100px', 
                      padding: '0 8px', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '4px',
                      color: getPriorityColor(t.priority),
                      textTransform: 'capitalize'
                    }}
                  >
                    {getPriorityIcon(t.priority)}
                    <span style={{ fontSize: '10px' }}>{t.priority.replace('_', ' ')}</span>
                  </span>

                  {/* Status Column */}
                  <span style={{ width: '110px', padding: '0 8px', display: 'flex', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '1px 6px',
                        background: 'var(--color-base50)',
                        border: '1px solid var(--color-border-default)',
                        borderRadius: '4px',
                        color: 'var(--color-text-secondary)',
                        textTransform: 'capitalize'
                      }}
                    >
                      {getStatusLabel(t.status)}
                    </span>
                  </span>

                  {/* Assignee Column */}
                  <span style={{ width: '90px', padding: '0 8px', display: 'flex', alignItems: 'center' }}>
                    {avatar ? (
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: 'var(--color-base50)',
                          border: '1px solid var(--color-border-default)',
                          overflow: 'hidden',
                        }}
                      >
                        <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)' }}>--</span>
                    )}
                  </span>
                </div>
              );
            }}
          />
        ) : (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-disabled)', fontSize: '12px' }}>
            No tickets match your filter criteria.
          </div>
        )}
      </div>
    </div>
  );
};
