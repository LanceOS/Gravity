import React, { useMemo } from 'react';
import type { MarkdownTextProps } from '../types/TicketDetail';
import { useTickets } from '../../../context/TicketContext';
import { useTicketByKey } from '../../../hooks/useTicketByKey';
import { getStatusColor } from '../utils/TicketDetail';

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
        type="button"
        onClick={handleClick}
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-default)',
          borderRadius: '4px',
          padding: '2px 6px',
          margin: '0 2px',
          color: 'var(--color-text-primary)',
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
            aria-hidden="true"
            role="presentation"
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
  const { projects } = useTickets();
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  // Memoize regex compilation to avoid recompilation on every render/line
  const ticketRegex = useMemo(() => {
    const projectKeys = projects?.map(p => p.key).filter(Boolean) || [];

    if (projectKeys.length === 0) {
      return /$^/i;
    }

    const projectKeysRegexPart = projectKeys
      .map(key => key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .join('|');

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
      parts.push(<strong key={key} style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{firstMatch.text}</strong>);
    } else if (firstMatch.type === 'code') {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<code key={key} style={{ background: 'var(--color-base50)', padding: '1px 4px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--color-text-primary)' }}>{firstMatch.text}</code>);
    } else if (firstMatch.type === 'link') {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<a key={key} href={firstMatch.url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'none' }} className="clickable">{firstMatch.text}</a>);
    } else if (firstMatch.type === 'ticket') {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<TicketLink key={key} ticketKey={firstMatch.text} />);
    }

    remaining = remaining.substring(firstMatch.index + firstMatch.length);
  }

  return <>{parts}</>;
}

import { CheckSquare, Square } from 'lucide-react';

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

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers (1-6 hashes)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const Tag = `h${Math.min(level + 1, 6)}` as keyof JSX.IntrinsicElements;
      
      const fontSizes = { 1: '16px', 2: '14px', 3: '13px', 4: '12px', 5: '12px', 6: '12px' };
      const fontSize = fontSizes[level as keyof typeof fontSizes] || '16px';
      const margin = level === 1 ? '12px 0 6px' : '10px 0 4px';
      
      elements.push(
        React.createElement(Tag, {
          key: i,
          style: { fontSize, fontWeight: 600, color: 'var(--color-text-primary)', margin }
        }, <FormattedText text={content} />)
      );
      continue;
    }

    // Blockquotes
    if (line.trim().startsWith('> ')) {
      const content = line.replace(/^\s*>\s+/, '');
      elements.push(
        <blockquote key={i} style={{ borderLeft: '3px solid var(--color-border-default)', paddingLeft: '12px', margin: '8px 0', color: 'var(--color-text-secondary)' }}>
          <FormattedText text={content} />
        </blockquote>
      );
      continue;
    }

    // Unordered lists and Task lists
    if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      const listItems: React.ReactNode[] = [];
      let isTask = false;
      
      while (i < lines.length && (lines[i].trim().startsWith('* ') || lines[i].trim().startsWith('- '))) {
        const currentLine = lines[i];
        const content = currentLine.replace(/^\s*[*-]\s+/, '');
        
        // Task list check
        const taskMatch = content.match(/^\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
          isTask = true;
          const isChecked = taskMatch[1].toLowerCase() === 'x';
          listItems.push(
            <li key={i} style={{ listStyle: 'none', display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '4px 0' }}>
              {isChecked ? (
                <CheckSquare size={16} color="var(--color-text-primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
              ) : (
                <Square size={16} color="var(--color-text-disabled)" style={{ marginTop: '2px', flexShrink: 0 }} />
              )}
              <span><FormattedText text={taskMatch[2]} /></span>
            </li>
          );
        } else {
          listItems.push(
            <li key={i} style={{ margin: '2px 0', fontSize: '13px' }}>
              <FormattedText text={content} />
            </li>
          );
        }
        i++;
      }
      i--; // step back since outer loop will increment
      
      elements.push(
        <ul key={`ul-${i}`} style={{ marginLeft: isTask ? '0' : '20px', paddingLeft: isTask ? '0' : '8px', marginBottom: '12px' }}>
          {listItems}
        </ul>
      );
      continue;
    }

    // Numbered lists
    const numberedMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].trim().match(/^(\d+)\.\s+(.*)$/)) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.*)$/);
        listItems.push(
          <li key={i} style={{ margin: '2px 0', fontSize: '13px' }}>
            <FormattedText text={m![2]} />
          </li>
        );
        i++;
      }
      i--; // step back
      
      elements.push(
        <ol key={`ol-${i}`} style={{ marginLeft: '24px', paddingLeft: '8px', marginBottom: '12px' }}>
          {listItems}
        </ol>
      );
      continue;
    }

    // Paragraphs
    elements.push(
      <p key={i} style={{ minHeight: '18px', margin: '4px 0' }}>
        <FormattedText text={line} />
      </p>
    );
  }

  return <div className="markdown-content">{elements}</div>;
}