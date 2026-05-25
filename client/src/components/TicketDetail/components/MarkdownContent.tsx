import React, { useState, useEffect } from 'react';
import type { MarkdownTextProps } from '../types';
import { useTickets } from '../../../context/TicketContext';

export function TicketLink({ ticketKey }: { ticketKey: string }) {
  const { tickets, setActiveTicket, setActiveProjectId } = useTickets();
  const [ticketInfo, setTicketInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizedKey = ticketKey.toUpperCase();
  const localTicket = tickets.find(t => t.key.toUpperCase() === normalizedKey);

  useEffect(() => {
    if (localTicket) {
      setTicketInfo(localTicket);
      return;
    }

    let active = true;
    setLoading(true);
    fetch(`/api/v1/tickets/key/${normalizedKey}`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not found');
      })
      .then(data => {
        if (active) {
          setTicketInfo(data);
        }
      })
      .catch(() => {
        if (active) setTicketInfo(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [normalizedKey, localTicket]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (localTicket) {
      setActiveTicket(localTicket);
    } else {
      if (ticketInfo) {
        setActiveProjectId(ticketInfo.projectId);
        setActiveTicket(ticketInfo);
      } else {
        try {
          const res = await fetch(`/api/v1/tickets/key/${normalizedKey}`);
          if (res.ok) {
            const data = await res.json();
            setActiveProjectId(data.projectId);
            setActiveTicket(data);
          }
        } catch (err) {
          console.error('Failed to navigate to ticket:', err);
        }
      }
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
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
        className="clickable"
        title={ticketInfo ? `View ${normalizedKey}` : `View ${normalizedKey} (Loading...)`}
      >
        {normalizedKey}{ticketInfo ? `: ${ticketInfo.title}` : ''}
      </button>
    </span>
  );
}

type MarkdownMatch =
  | { index: number; length: number; type: 'bold'; text: string }
  | { index: number; length: number; type: 'code'; text: string }
  | { index: number; length: number; type: 'link'; text: string; url: string }
  | { index: number; length: number; type: 'ticket'; text: string };

function FormattedText({ text }: MarkdownTextProps) {
  const { tickets, projects, setActiveTicket, setActiveProjectId } = useTickets();
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  // Dynamically generate the regex using the actual workspace project keys to be highly precise
  const projectKeys = projects?.map(p => p.key).filter(Boolean) || [];
  const projectKeysRegexPart = projectKeys.length > 0 
    ? projectKeys.map(key => key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')
    : '[A-Z0-9]+';
  
  const ticketRegex = new RegExp(`\\b(${projectKeysRegexPart})-\\d+\\b`, 'i');

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
    } else {
      const key = keyIndex;
      keyIndex += 1;
      parts.push(<TicketLink key={key} ticketKey={firstMatch.text} />);
    }

    remaining = remaining.substring(firstMatch.index + firstMatch.length);
  }

  return <>{parts}</>;
}

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