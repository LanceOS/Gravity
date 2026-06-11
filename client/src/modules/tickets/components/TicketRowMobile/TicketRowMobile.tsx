import { memo, useState, useCallback } from 'react';
import { Paperclip } from 'lucide-react';
import type { TicketRowProps } from '../../types/TicketList';
import { LabelBadge } from '../LabelBadge';
import './TicketRowMobile.css';

function TicketRowMobileImpl({ ticket, onClick, priorityIcon, assigneeAvatar, projectName }: TicketRowProps) {
  const [isHovered, setIsHovered] = useState(false);

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

        <span className="ticket-row-mobile__title">{ticket.title}</span>

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
