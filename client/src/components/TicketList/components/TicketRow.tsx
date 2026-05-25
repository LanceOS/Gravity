import { memo } from 'react';
import { GitMerge, GitPullRequest, Paperclip } from 'lucide-react';
import type { TicketRowProps } from '../types';

function TicketRowImpl({ ticket, onClick, priorityIcon, assigneeAvatar, domainTag }: TicketRowProps) {
  return (
    <div
      onClick={onClick}
      className="clickable"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border-default)',
        borderRadius: '6px',
        transition: 'background 0.15s ease, border-color 0.15s ease',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{priorityIcon}</div>

      <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--color-text-disabled)', width: '60px', flexShrink: 0 }}>
        {ticket.key}
      </span>

      <span
        style={{
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {ticket.title}
      </span>

      <div style={{ flexShrink: 0 }}>{domainTag}</div>

      {ticket.prStatus !== 'none' ? (
        <a
          href={ticket.prUrl || '#'}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: ticket.prStatus === 'merged' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
            border: `1px solid ${ticket.prStatus === 'merged' ? '#10b98140' : '#3b82f640'}`,
            color: ticket.prStatus === 'merged' ? '#10b981' : '#3b82f6',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          {ticket.prStatus === 'merged' ? <GitMerge size={12} /> : <GitPullRequest size={12} />}
          <span>PR {ticket.prStatus.toUpperCase()}</span>
        </a>
      ) : null}

      {ticket.parentId ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            fontSize: '11px',
            color: 'var(--color-text-disabled)',
            background: 'var(--color-base50)',
            padding: '2px 6px',
            borderRadius: '4px',
            flexShrink: 0,
          }}
        >
          <Paperclip size={10} />
          <span>Sub</span>
        </span>
      ) : null}

      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--color-base50)', border: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {assigneeAvatar ? (
          <img src={assigneeAvatar} alt="" style={{ width: '100%', height: '100%' }} />
        ) : (
          <span style={{ fontSize: '9px', color: 'var(--color-text-disabled)', fontWeight: 500 }}>--</span>
        )}
      </div>

      <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)', width: '70px', textAlign: 'right', flexShrink: 0 }}>
        {new Date(ticket.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </span>
    </div>
  );
}

export const TicketRow = memo(TicketRowImpl);