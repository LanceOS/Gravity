import { memo, useState, useCallback } from 'react';
import { Paperclip } from 'lucide-react';
import type { TicketRowProps } from '../types/TicketList';
import './TicketRowMobile.css';

function TicketRowMobileImpl({ ticket, onClick, priorityIcon, assigneeAvatar, domainTag }: TicketRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(() => {
    onClick(ticket);
  }, [onClick, ticket]);

  const hasMeta = !!ticket.domainId || !!ticket.parentId;

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

      {/* Meta row: domain + sub-ticket indicator */}
      {hasMeta && (
        <div className="ticket-row-mobile__meta">
          {ticket.domainId && domainTag && (
            <div className="ticket-row-mobile__domain">{domainTag}</div>
          )}
          {ticket.parentId && (
            <span className="ticket-row-mobile__sub-tag">
              <Paperclip size={9} />
              <span>Sub-ticket</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const TicketRowMobile = memo(TicketRowMobileImpl);
