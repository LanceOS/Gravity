import React, { useMemo } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import type { MarkdownTextProps } from '../types/TicketDetail';
import { useTickets } from '../../../context/TicketContext';
import { useTicketByKey } from '../../../hooks/useTicketByKey';
import { getStatusColor } from '../utils/TicketDetail';
import { renderRichTextHtml } from '@library';

/**
 * @description A component that renders an interactive ticket link for a given ticket key.
 * It dynamically fetches ticket details (title and status) and displays them inline as a styled button.
 * Clicking the link navigates to the associated ticket and updates the active project context if needed.
 * @param {Object} props - The component props.
 * @param {string} props.ticketKey - The unique ticket key, such as `GRA-123`.
 * @returns {JSX.Element} A React component rendering the inline ticket button.
 */
export function TicketLink({ ticketKey }: { ticketKey: string }) {
  const { ticketMap, setActiveTicket, setActiveProjectId } = useTickets();
  const normalizedKey = ticketKey.toUpperCase();
  const localTicket = ticketMap.get(normalizedKey);
  const { ticketInfo } = useTicketByKey(normalizedKey);

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
              flexShrink: 0,
            }}
          />
        )}
        <span>{normalizedKey}{ticketInfo ? `: ${ticketInfo.title}` : ''}</span>
      </button>
    </span>
  );
}

function escapeRegex(value: string) {
  return value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function renderTextWithTicketLinks(text: string, ticketRegex: RegExp): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let keyIndex = 0;
  const matches = Array.from(text.matchAll(ticketRegex));

  for (const match of matches) {
    if (match.index !== undefined && match.index > lastIndex) {
      nodes.push(<React.Fragment key={`text-${keyIndex++}`}>{text.substring(lastIndex, match.index)}</React.Fragment>);
    }

    if (match[1]) {
      nodes.push(<TicketLink key={`ticket-${keyIndex++}`} ticketKey={match[1]} />);
    }

    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(<React.Fragment key={`text-${keyIndex++}`}>{text.substring(lastIndex)}</React.Fragment>);
  }

  return nodes;
}

function renderNode(
  node: ChildNode,
  ticketRegex: RegExp,
  keyPrefix: string,
  skipTicketLinks: boolean,
): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    return skipTicketLinks ? text : renderTextWithTicketLinks(text, ticketRegex);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const childSkip = skipTicketLinks || tag === 'a' || tag === 'code' || tag === 'pre';
  const children = Array.from(element.childNodes).flatMap((child, index) => {
    const rendered = renderNode(child, ticketRegex, `${keyPrefix}-${index}`, childSkip);
    return Array.isArray(rendered) ? rendered : rendered == null ? [] : [rendered];
  });

  switch (tag) {
    case 'p':
      return (
        <p key={keyPrefix} style={{ marginBottom: '10px', lineHeight: 1.6 }}>
          {children}
        </p>
      );
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag.slice(1));
      const sizeMap: Record<number, string> = {
        1: '16px',
        2: '15px',
        3: '14px',
        4: '13px',
        5: '12px',
        6: '12px',
      };

      return React.createElement(
        tag,
        {
          key: keyPrefix,
          style: {
            fontSize: sizeMap[level] || '14px',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            margin: level === 1 ? '12px 0 6px' : '10px 0 4px',
          },
        },
        children,
      );
    }
    case 'blockquote':
      return (
        <blockquote
          key={keyPrefix}
          style={{
            borderLeft: '3px solid var(--color-border-default)',
            paddingLeft: '12px',
            margin: '8px 0',
            color: 'var(--color-text-secondary)',
          }}
        >
          {children}
        </blockquote>
      );
    case 'ul':
      return (
        <ul key={keyPrefix} style={{ marginLeft: '20px', paddingLeft: '8px', marginBottom: '12px' }}>
          {children}
        </ul>
      );
    case 'ol':
      return (
        <ol key={keyPrefix} style={{ marginLeft: '24px', paddingLeft: '8px', marginBottom: '12px' }}>
          {children}
        </ol>
      );
    case 'li':
      return (
        <li key={keyPrefix} style={{ margin: '2px 0', fontSize: '13px' }}>
          {children}
        </li>
      );
    case 'strong':
      return (
        <strong key={keyPrefix} style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {children}
        </strong>
      );
    case 'em':
      return <em key={keyPrefix}>{children}</em>;
    case 'code':
      return (
        <code
          key={keyPrefix}
          style={{
            background: 'var(--color-base50)',
            padding: '1px 4px',
            borderRadius: '4px',
            fontSize: '11.5px',
            fontFamily: 'var(--mono)',
            color: 'var(--color-text-primary)',
          }}
        >
          {children}
        </code>
      );
    case 'pre':
      return (
        <pre
          key={keyPrefix}
          style={{
            background: 'var(--color-base50)',
            border: '1px solid var(--color-border-default)',
            borderRadius: '6px',
            padding: '12px 14px',
            overflowX: 'auto',
            marginBottom: '12px',
          }}
        >
          {children}
        </pre>
      );
    case 'a': {
      const href = element.getAttribute('href') || 'about:blank';
      return (
        <a
          key={keyPrefix}
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
          className="clickable"
        >
          {children}
        </a>
      );
    }
    case 'img':
      return (
        <img
          key={keyPrefix}
          src={element.getAttribute('src') || ''}
          alt={element.getAttribute('alt') || ''}
          title={element.getAttribute('title') || undefined}
          style={{ maxWidth: '100%', height: 'auto', borderRadius: '6px', margin: '8px 0' }}
        />
      );
    case 'br':
      return <br key={keyPrefix} />;
    default:
      return <React.Fragment key={keyPrefix}>{children}</React.Fragment>;
  }
}

export function MarkdownContent({ text }: MarkdownTextProps) {
  const { projects } = useTickets();

  const ticketRegex = useMemo(() => {
    const projectKeys = projects?.map((project) => project.key).filter(Boolean) || [];
    if (projectKeys.length === 0) {
      return /$^/g;
    }

    const escapedKeys = projectKeys.map(escapeRegex).join('|');
    return new RegExp(`\\b(${escapedKeys}-\\d+)\\b`, 'gi');
  }, [projects]);

  const rendered = useMemo(() => {
    if (!text) {
      return null;
    }

    const html = renderRichTextHtml(text);
    if (!html) {
      return null;
    }

    const template = document.createElement('template');
    template.innerHTML = html;

    return Array.from(template.content.childNodes).flatMap((node, index) => {
      const renderedNode = renderNode(node, ticketRegex, `richtext-${index}`, false);
      return Array.isArray(renderedNode) ? renderedNode : renderedNode == null ? [] : [renderedNode];
    });
  }, [text, ticketRegex]);

  if (!rendered || rendered.length === 0) {
    return null;
  }

  return <>{rendered}</>;
}
