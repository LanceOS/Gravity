import { memo } from 'react';
import { GitMerge, GitPullRequest, Paperclip } from 'lucide-react';
import type { TicketCardProps } from '../types';

function TicketCardImpl({
  ticket,
  onClick,
  onDragStart,
  priorityIcon,
  priorityColor,
  domainColor,
  domainName,
  assigneeAvatar,
}: TicketCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="clickable"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${priorityColor}`,
        borderRadius: '6px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        cursor: 'grab',
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
          {ticket.key}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {ticket.parentId ? <Paperclip size={10} color="var(--text-muted)" /> : null}

          {ticket.prStatus !== 'none' ? (
            <div
              title={`PR ${ticket.prStatus}`}
              style={{
                color: ticket.prStatus === 'merged' ? '#10b981' : '#3b82f6',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {ticket.prStatus === 'merged' ? <GitMerge size={12} /> : <GitPullRequest size={12} />}
            </div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text-heading)',
          lineHeight: '1.4',
          wordBreak: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {ticket.title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.01)', paddingTop: '8px', marginTop: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>{priorityIcon}</div>

          {domainColor !== 'transparent' ? (
            <div
              title={domainName}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: domainColor,
              }}
            />
          ) : null}
        </div>

        <div
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: 'var(--sidebar-bg)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {assigneeAvatar ? (
            <img src={assigneeAvatar} alt="" style={{ width: '100%', height: '100%' }} />
          ) : (
            <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>--</span>
          )}
        </div>
      </div>
    </div>
  );
}

export const TicketCard = memo(TicketCardImpl);