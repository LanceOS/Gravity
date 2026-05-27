import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
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

/**
 * @description A utility component that parses a raw markdown string and replaces specific patterns
 * (like bold text, inline code, external links, and workspace ticket keys) with their corresponding React elements.
 * Employs a single-pass regex tokenizer for O(L) time complexity and sanitizes URLs to prevent XSS.
 * @param {MarkdownTextProps} props - The component props.
 * @param {string} props.text - The raw markdown text to be parsed and formatted.
 * @returns {JSX.Element} A React fragment containing the parsed and formatted text nodes.
 */
function FormattedText({ text }: MarkdownTextProps) {
  const { projects } = useTickets();
  const parts: React.ReactNode[] = [];
  let keyIndex = 0;
  let lastIndex = 0;

  const ticketRegexPart = useMemo(() => {
    const projectKeys = projects?.map(p => p.key).filter(Boolean) || [];
    if (projectKeys.length === 0) return '$^';
    const escapedKeys = projectKeys.map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
    return `(?:${escapedKeys})`;
  }, [projects]);

  const combinedRegex = useMemo(() => {
    return new RegExp(
      `\\*\\*([^*]+)\\*\\*|\`([^\`]+)\`|\\[([^\\]]+)\\]\\(([^)]+)\\)|\\b(${ticketRegexPart}-\\d+)\\b`,
      'gi'
    );
  }, [ticketRegexPart]);

  const isSafeUrl = (url: string) => {
    // Rely on DOMPurify's battle-tested URL validation to prevent XSS
    return DOMPurify.isValidAttribute('a', 'href', url);
  };

  const matches = Array.from(text.matchAll(combinedRegex));

  for (const match of matches) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push(<span key={keyIndex++}>{text.substring(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      parts.push(<strong key={keyIndex++} style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{match[1]}</strong>);
    } else if (match[2]) {
      parts.push(<code key={keyIndex++} style={{ background: 'var(--color-base50)', padding: '1px 4px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--color-text-primary)' }}>{match[2]}</code>);
    } else if (match[3] && match[4]) {
      const safeHref = isSafeUrl(match[4]) ? match[4] : 'about:blank';
      parts.push(<a key={keyIndex++} href={safeHref} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'none' }} className="clickable">{match[3]}</a>);
    } else if (match[5]) {
      parts.push(<TicketLink key={keyIndex++} ticketKey={match[5]} />);
    }

    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={keyIndex++}>{text.substring(lastIndex)}</span>);
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