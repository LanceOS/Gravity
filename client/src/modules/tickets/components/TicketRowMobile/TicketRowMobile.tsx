import { memo, useState, useCallback } from 'react';
import { Paperclip } from 'lucide-react';
import type { TicketRowProps } from '../../types/TicketList';
import { LabelBadge } from '../LabelBadge';
import { TicketRelationIndicators } from '../TicketRelationIndicators';
import { TicketStatusBadge } from '../TicketStatusBadge';
import './TicketRowMobile.css';

function TicketRowMobileImpl({ ticket, onClick, priorityIcon, assigneeAvatar, projectName }: TicketRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isCompleted = ticket.status === 'done' || ticket.status === 'canceled';

  const handleClick = useCallback(() => {
    onClick(ticket);
  }, [onClick, ticket]);

  const formattedDate = new Date(ticket.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div
      onClick={handleClick}
      className={`ticket-row-mobile clickable${isHovered ? ' ticket-row-mobile--hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main row: priority icon, title, avatar */}
      <div className="ticket-row-mobile__main">
        <div className="ticket-row-mobile__priority">{priorityIcon}</div>

        <div
          className="ticket-row-mobile__title-wrap"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flex: 1,
            minWidth: 0,
          }}
        >
          <TicketStatusBadge status={ticket.status} />

          <span
            className="ticket-row-mobile__title"
            style={{
              color: isCompleted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
              textDecoration: isCompleted ? 'line-through' : 'none',
              opacity: isCompleted ? 0.85 : 1,
              minWidth: 0,
              flex: 1,
            }}
          >
            {ticket.title}
          </span>
        </div>

        <div className="ticket-row-mobile__avatar">
          {assigneeAvatar ? (
            <img src={assigneeAvatar} alt="" className="ticket-row-mobile__avatar-img" />
          ) : (
            <span className="ticket-row-mobile__avatar-placeholder">--</span>
          )}
        </div>
      </div>

      {/* Meta row: project badge + labels + sub-ticket indicator + date */}
      <div className="ticket-row-mobile__meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {projectName && (
            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-default)', borderRadius: '3px', padding: '1px 5px' }}>
              {projectName}
            </span>
          )}
          <TicketRelationIndicators ticket={ticket} />
          {ticket.labels?.map((label) => (
            <LabelBadge key={label.id} label={label} size="sm" />
          ))}
          {ticket.parentId && (
            <span className="ticket-row-mobile__sub-tag">
              <Paperclip size={9} />
              <span>Sub-ticket</span>
            </span>
          )}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-text-disabled)', whiteSpace: 'nowrap' }}>
          {formattedDate}
        </span>
      </div>
    </div>
  );
}

export const TicketRowMobile = memo(TicketRowMobileImpl);
