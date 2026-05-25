import React, { useMemo } from 'react';
import type { MarkdownTextProps } from '../types';
import { useTickets } from '../../../context/TicketContext';
import { useTicketByKey } from '../../../hooks/useTicketByKey';

/**
 * @description A component that renders an interactive ticket link for a given ticket key.
 * It dynamically fetches ticket details (title and status) and displays them inline as a styled button.
 * Clicking the link navigates to the associated ticket and updates the active project context if needed.
 * @param {Object} props - The component props.
 * @param {string} props.ticketKey - The unique key of the ticket to link to (e.g., 'GRAV-1').
 * @returns {JSX.Element} A React component rendering the inline ticket button.
 */
export function TicketLink({ ticketKey }: { ticketKey: string }) {
  const { tickets, setActiveTicket, setActiveProjectId } = useTickets();
  const normalizedKey = ticketKey.toUpperCase();
  const localTicket = tickets.find(t => t.key.toUpperCase() === normalizedKey);
  const { ticketInfo } = useTicketByKey(normalizedKey);

  /**
   * @description Handles the click event on the ticket link button. 
   * It prevents the default action and sets the active ticket and project in the global context.
   * @param {React.MouseEvent} e - The mouse event triggered by clicking the button.
   * @returns {void}
   */
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const resolvedTicket = localTicket || ticketInfo;
    if (resolvedTicket) {
      if (resolvedTicket.projectId) {
        setActiveProjectId(resolvedTicket.projectId);
      }
      setActiveTicket(resolvedTicket);
    }
  };

  /**
   * @description Maps a given ticket status to its corresponding brand color.
   * @param {string} status - The current status of the ticket (e.g., 'todo', 'in_progress', 'done').
   * @returns {string} The hex color code or CSS variable associated with the status.
   */
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return '#9CA3AF';
      case 'todo': return '#3B82F6';
      case 'in_progress': return '#F59E0B';
      case 'in_review': return '#8B5CF6';
      case 'done': return '#10B981';
      case 'canceled': return '#EF4444';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <span style={{ display: 'inline-block' }}>
      <button
        type="button"
        onClick={handleClick}
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '2px 6px',
          margin: '0 2px',
          color: 'var(--text-heading)',
          fontFamily: 'var(--mono)',
          fontSize: '0.9em',
          fontWeight: 600,
          textDecoration: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
        className="clickable"
        title={ticketInfo ? `View ${normalizedKey}` : `View ${normalizedKey} (Loading...)`}
      >
        {ticketInfo && (
          <span 
            style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: getStatusColor(ticketInfo.status),
              flexShrink: 0
            }} 
          />
        )}
        <span>{normalizedKey}{ticketInfo ? `: ${ticketInfo.title}` : ''}</span>
      </button>
    </span>
  );
}

type MarkdownMatch =
  | { index: number; length: number; type: 'bold'; text: string }
  | { index: number; length: number; type: 'code'; text: string }
  | { index: number; length: number; type: 'link'; text: string; url: string }
  | { index: number; length: number; type: 'ticket'; text: string };

/**
 * @description A utility component that parses a raw markdown string and replaces specific patterns
 * (like bold text, inline code, external links, and workspace ticket keys) with their corresponding React elements.
 * @param {MarkdownTextProps} props - The component props.
 * @param {string} props.text - The raw markdown text to be parsed and formatted.
 * @returns {JSX.Element} A React fragment containing the parsed and formatted text nodes.
 */
function FormattedText({ text }: MarkdownTextProps) {
  const { tickets, projects, setActiveTicket, setActiveProjectId } = useTickets();
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  // Memoize regex compilation to avoid recompilation on every render/line
  const ticketRegex = useMemo(() => {
    const projectKeys = projects?.map(p => p.key).filter(Boolean) || [];
    const projectKeysRegexPart = projectKeys.length > 0 
      ? projectKeys.map(key => key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')
      : '[A-Z0-9]+';
    
    return new RegExp(`\\b(${projectKeysRegexPart})-\\d+\\b`, 'i');
  }, [projects]);

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const ticketMatch = remaining.match(ticketRegex);

    const matches: MarkdownMatch[] = [
      boldMatch && boldMatch.index !== undefined
        ? { index: boldMatch.index, length: boldMatch[0].length, type: 'bold', text: boldMatch[1] }
        : null,
      codeMatch && codeMatch.index !== undefined
        ? { index: codeMatch.index, length: codeMatch[0].length, type: 'code', text: codeMatch[1] }
        : null,
      linkMatch && linkMatch.index !== undefined
        ? { index: linkMatch.index, length: linkMatch[0].length, type: 'link', text: linkMatch[1], url: linkMatch[2] }
        : null,
      ticketMatch && ticketMatch.index !== undefined
        ? { index: ticketMatch.index, length: ticketMatch[0].length, type: 'ticket', text: ticketMatch[0] }
        : null,
    ].filter((match): match is MarkdownMatch => match !== null);

    if (matches.length === 0) {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<span key={key}>{remaining}</span>);
      break;
    }

    matches.sort((left, right) => left.index - right.index);
    const firstMatch = matches[0];

    if (firstMatch.index > 0) {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<span key={key}>{remaining.substring(0, firstMatch.index)}</span>);
    }

    if (firstMatch.type === 'bold') {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<strong key={key} style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{firstMatch.text}</strong>);
    } else if (firstMatch.type === 'code') {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<code key={key} style={{ background: 'var(--sidebar-bg)', padding: '1px 4px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-heading)' }}>{firstMatch.text}</code>);
    } else if (firstMatch.type === 'link') {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<a key={key} href={firstMatch.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }} className="clickable">{firstMatch.text}</a>);
    } else if (firstMatch.type === 'ticket') {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<TicketLink key={key} ticketKey={firstMatch.text} />);
    } else {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<span key={key}>{firstMatch.text}</span>);
    }

    remaining = remaining.substring(firstMatch.index + firstMatch.length);
  }

  return <>{parts}</>;
}

/**
 * @description A lightweight markdown renderer component. It splits the input text by lines and parses
 * basic markdown elements like headers (h2, h3), unordered lists, and paragraphs.
 * It delegates inline text formatting to the FormattedText component.
 * @param {MarkdownTextProps} props - The component props.
 * @param {string} props.text - The full markdown string to render.
 * @returns {JSX.Element | null} A React fragment containing the rendered markdown blocks, or null if text is empty.
 */
export function MarkdownContent({ text }: MarkdownTextProps) {
  if (!text) {
    return null;
  }

  return (
    <>
      {text.split('\n').map((line, lineIndex) => {
        if (line.startsWith('# ')) {
          return <h2 key={lineIndex} style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-heading)', margin: '12px 0 6px' }}>{line.replace('# ', '')}</h2>;
        }

        if (line.startsWith('## ')) {
          return <h3 key={lineIndex} style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '10px 0 4px' }}>{line.replace('## ', '')}</h3>;
        }

        if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
          const content = line.replace(/^\s*[*-]\s+/, '');
          return <li key={lineIndex} style={{ marginLeft: '12px', fontSize: '13px', margin: '2px 0' }}><FormattedText text={content} /></li>;
        }

        return (
          <p key={lineIndex} style={{ minHeight: '18px', margin: '4px 0' }}>
            <FormattedText text={line} />
          </p>
        );
      })}
    </>
  );
}