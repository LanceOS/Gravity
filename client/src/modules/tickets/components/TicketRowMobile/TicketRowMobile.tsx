import { memo, useCallback } from 'react';
import { Paperclip } from 'lucide-react';
import type { TicketRowProps } from '../../types/TicketList';
import { LabelBadge } from '../LabelBadge';
import { TicketRelationIndicators } from '../TicketRelationIndicators';
import { TicketStatusBadge } from '../TicketStatusBadge';
import { getPriorityIcon } from '../../../../utils/ticketPresentation';
import { formatTicketDate } from '../../utils/ticketDateFormatter';
import './TicketRowMobile.css';

function haveLabelSetsChanged(prevLabels?: TicketRowProps['ticket']['labels'], nextLabels?: TicketRowProps['ticket']['labels']): boolean {
  if (prevLabels === nextLabels) {
    return false;
  }

  if (!prevLabels || !nextLabels) {
    return Boolean(prevLabels?.length || nextLabels?.length);
  }

  if (prevLabels.length !== nextLabels.length) {
    return true;
  }

  for (let i = 0; i < prevLabels.length; i += 1) {
    if (prevLabels[i]?.id !== nextLabels[i]?.id) {
      return true;
    }
  }

  return false;
}

function TicketRowMobileImpl({
  ticket,
  onClick,
  priorityIcon,
  priority,
  assigneeAvatar,
  projectName,
}: TicketRowProps) {
  const isCompleted = ticket.status === 'done' || ticket.status === 'canceled';
  const renderedPriorityIcon = priorityIcon ?? getPriorityIcon(priority);
  const formattedDate = formatTicketDate(ticket.createdAt);
  const truncatedTitle = ticket.title.length > 150 ? `${ticket.title.slice(0, 149)}…` : ticket.title;

  const handleClick = useCallback(() => {
    onClick(ticket);
  }, [onClick, ticket]);

  return (
    <div
      onClick={handleClick}
      className="ticket-row-mobile clickable"
    >
      {/* Main row: priority icon, title, avatar */}
      <div className="ticket-row-mobile__main">
          <div className="ticket-row-mobile__priority">{renderedPriorityIcon}</div>

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
            {truncatedTitle}
          </span>
        </div>

        <div className="ticket-row-mobile__avatar">
          {assigneeAvatar ? (
            <img
              src={assigneeAvatar}
              alt=""
              className="ticket-row-mobile__avatar-img"
              loading="lazy"
              decoding="async"
            />
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

function shouldRerenderTicketRowMobile(prevProps: TicketRowProps, nextProps: TicketRowProps) {
  const prevTicket = prevProps.ticket;
  const nextTicket = nextProps.ticket;

  return (
    prevTicket.id === nextTicket.id &&
    prevTicket.title === nextTicket.title &&
    prevTicket.key === nextTicket.key &&
    prevTicket.status === nextTicket.status &&
    prevTicket.priority === nextTicket.priority &&
    prevTicket.parentId === nextTicket.parentId &&
    prevTicket.prStatus === nextTicket.prStatus &&
    prevTicket.assigneeId === nextTicket.assigneeId &&
    prevTicket.createdAt === nextTicket.createdAt &&
    prevTicket.updatedAt === nextTicket.updatedAt &&
    !haveLabelSetsChanged(prevTicket.labels, nextTicket.labels) &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.priorityIcon === nextProps.priorityIcon &&
    prevProps.assigneeAvatar === nextProps.assigneeAvatar &&
    prevProps.projectName === nextProps.projectName
  );
}

export const TicketRowMobile = memo(TicketRowMobileImpl, shouldRerenderTicketRowMobile);
