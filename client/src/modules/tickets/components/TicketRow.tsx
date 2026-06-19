import { memo, useState, useCallback } from 'react';
import { GitMerge, GitPullRequest, Paperclip } from 'lucide-react';
import type { TicketRowProps } from '../types/TicketList';
import { LabelBadge } from './LabelBadge';
import { TicketRelationIndicators } from './TicketRelationIndicators';

function TicketRowImpl({ ticket, onClick, priorityIcon, assigneeAvatar, projectName, projectColor }: TicketRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(() => {
    onClick(ticket);
  }, [onClick, ticket]);

  return (
    <div
      onClick={handleClick}
      className="ticket-row clickable"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        background: isHovered ? 'var(--color-surface-overlay)' : 'var(--color-surface-card)',
        border: '1px solid',
        borderColor: isHovered ? 'var(--color-border-focus)' : 'var(--color-border-default)',
        borderRadius: '6px',
        transition: 'all 0.15s ease',
        cursor: 'pointer',
      }}
    >
      <div className="ticket-row-priority" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{priorityIcon}</div>

      <span className="ticket-row-key" style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--color-text-disabled)', width: '60px', flexShrink: 0 }}>
        {ticket.key}
      </span>

      {projectName && (
        <span
          className="ticket-row-project"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
            background: 'var(--color-surface-overlay)',
            border: '1px solid var(--color-border-default)',
            borderRadius: '4px',
            padding: '2px 7px',
            flexShrink: 0,
            maxWidth: '120px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: projectColor || 'var(--color-primary)',
              flexShrink: 0,
            }}
          />
          {projectName}
        </span>
      )}

      <span
        className="ticket-row-title"
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

      <div className="ticket-row-domain" style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
        <TicketRelationIndicators ticket={ticket} />
        {ticket.labels?.map((label) => (
          <LabelBadge key={label.id} label={label} size="sm" />
        ))}
      </div>

      {ticket.prStatus !== 'none' ? (
        <a
          href={ticket.prUrl || '#'}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="ticket-row-pr"
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
          className="ticket-row-sub"
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

      <div className="ticket-row-avatar" style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--color-base50)', border: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {assigneeAvatar ? (
          <img src={assigneeAvatar} alt="" style={{ width: '100%', height: '100%' }} />
        ) : (
          <span style={{ fontSize: '9px', color: 'var(--color-text-disabled)', fontWeight: 500 }}>--</span>
        )}
      </div>

      <span className="ticket-row-date" style={{ fontSize: '11px', color: 'var(--color-text-disabled)', width: '70px', textAlign: 'right', flexShrink: 0 }}>
        {new Date(ticket.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </span>
    </div>
  );
}

export const TicketRow = memo(TicketRowImpl);
