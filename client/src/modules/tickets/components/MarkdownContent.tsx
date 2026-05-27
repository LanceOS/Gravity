import React, { useMemo } from 'react';
import type { MarkdownTextProps } from '../types/TicketDetail';
import { useTickets } from '../../../context/TicketContext';
import { useTicketByKey } from '../../../hooks/useTicketByKey';
import { getStatusColor } from '../utils/TicketDetail';
import { MarkdownRenderer } from '@library';

/**
 * @description A component that renders an interactive ticket link for a given ticket key.
 * It dynamically fetches ticket details (title and status) and displays them inline as a styled button.
 * Clicking the link navigates to the associated ticket and updates the active project context if needed.
 * @param {Object} props - The component props.
 * @param {string} props.ticketKey - The unique key of the ticket to link to (e.g., 'GRAV-1').
 * @returns {JSX.Element} A React component rendering the inline ticket button.
 */
export function TicketLink({ ticketKey }: { ticketKey: string }) {
  const { ticketMap, setActiveTicket, setActiveProjectId } = useTickets();
  const normalizedKey = ticketKey.toUpperCase();
  const localTicket = ticketMap.get(normalizedKey);
  const { ticketInfo } = useTicketByKey(normalizedKey);

  /**
   * @description Handles the click event on the ticket link button.
   * It prevents the default action and updates the active project context. Only
   * fully-hydrated tickets from the local ticket list are passed to
   * `setActiveTicket`; partial ticket data from `useTicketByKey` is used only
   * to locate the target project.
   * @param {React.MouseEvent} e - The mouse event triggered by clicking the button.
   * @returns {void}
   */
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();

    const resolvedProjectId = localTicket?.projectId || ticketInfo?.projectId;
    if (resolvedProjectId) {
      setActiveProjectId(resolvedProjectId);
    }

    if (localTicket) {
      setActiveTicket(localTicket);
    }
  };

  return (
    <span style={{ display: 'inline-block' }}>
      <button
        onClick={handleClick}
        className="clickable"
        style={{
          background: 'var(--color-base50)',
          border: '1px solid var(--color-border-default)',
          borderRadius: '4px',
          padding: '2px 6px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          transition: 'all var(--transition-fast)',
          textDecoration: 'none',
          verticalAlign: 'middle',
          margin: '0 2px'
        }}
        title={ticketInfo?.title || `Ticket ${normalizedKey}`}
      >
        <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          {normalizedKey}
        </span>
        
        {ticketInfo && (
          <span style={{ 
            color: 'var(--color-text-secondary)',
            maxWidth: '150px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {ticketInfo.title}
          </span>
        )}

        {ticketInfo?.status && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: getStatusColor(ticketInfo.status),
            background: `${getStatusColor(ticketInfo.status)}15`,
            padding: '2px 4px',
            borderRadius: '2px'
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: getStatusColor(ticketInfo.status) }} />
            {ticketInfo.status}
          </span>
        )}
      </button>
    </span>
  );
}

/**
 * @description A lightweight markdown renderer component for tickets.
 * It uses the generic MarkdownRenderer and injects the domain-specific TicketLink component.
 * @param {MarkdownTextProps} props - The component props.
 * @param {string} props.text - The full markdown string to render.
 * @returns {JSX.Element | null} A React fragment containing the rendered markdown blocks.
 */
export function MarkdownContent({ text }: MarkdownTextProps) {
  const { projects } = useTickets();

  const customTokenRegex = useMemo(() => {
    const projectKeys = projects?.map(p => p.key).filter(Boolean) || [];
    if (projectKeys.length === 0) return undefined;
    const escapedKeys = projectKeys.map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
    return new RegExp(`\\b((?:${escapedKeys})-\\d+)\\b`);
  }, [projects]);

  const renderCustomToken = useMemo(() => {
    return (match: RegExpMatchArray, keyIndex: number) => {
      // For our generic customTokenRegex \b((?:KEY)-\d+)\b, the match group 1 is the key
      if (match[5]) {
        return <TicketLink key={keyIndex} ticketKey={match[5]} />;
      }
      return null;
    };
  }, []);

  return <MarkdownRenderer text={text} customTokenRegex={customTokenRegex} renderCustomToken={renderCustomToken} />;
}