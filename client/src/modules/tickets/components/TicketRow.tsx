import { memo, useCallback } from 'react';
import { GitMerge, GitPullRequest, Paperclip } from 'lucide-react';
import type { TicketRowProps } from '../types/TicketList';
import { LabelBadge } from './LabelBadge';
import { TicketRelationIndicators } from './TicketRelationIndicators';
import { TicketStatusBadge } from './TicketStatusBadge';
import { getPriorityIcon } from '../../../utils/ticketPresentation';
import { formatTicketDate } from '../utils/ticketDateFormatter';
import './TicketRow.css';

type TicketLabelList = TicketRowProps['ticket']['labels'];

function haveLabelSetsChanged(prevLabels?: TicketLabelList | null, nextLabels?: TicketLabelList | null): boolean {
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

function TicketRowImpl({
  ticket,
  onClick,
  priorityIcon,
  priority,
  assigneeAvatar,
  projectName,
  projectColor,
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
      className="ticket-row clickable"
    >
      <div className="ticket-row-priority">
        {renderedPriorityIcon}
      </div>

      <div className="ticket-row-title-wrap">
        <span className="ticket-row-key">
          {ticket.key}
        </span>

        {projectName && (
          <span
            className="ticket-row-project"
            title={projectName}
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <span aria-hidden="true" className="ticket-row-project__dot" style={{ background: projectColor || 'var(--color-primary)' }} />
            {projectName}
          </span>
        )}

        <TicketStatusBadge status={ticket.status} />

        <span
          className="ticket-row-title"
          style={{
            color: isCompleted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
            textDecoration: isCompleted ? 'line-through' : 'none',
            opacity: isCompleted ? 0.85 : 1,
          }}
        >
          {truncatedTitle}
        </span>
      </div>

      <div className="ticket-row-domain">
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
            background: ticket.prStatus === 'merged' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
            border: `1px solid ${ticket.prStatus === 'merged' ? '#10b98140' : '#3b82f640'}`,
            color: ticket.prStatus === 'merged' ? '#10b981' : '#3b82f6',
          }}
        >
          {ticket.prStatus === 'merged' ? <GitMerge size={12} /> : <GitPullRequest size={12} />}
          <span>PR {ticket.prStatus.toUpperCase()}</span>
        </a>
      ) : null}

      {ticket.parentId ? (
        <span className="ticket-row-sub">
          <Paperclip size={10} />
          <span>Sub</span>
        </span>
      ) : null}

      <div className="ticket-row-avatar">
        {assigneeAvatar ? (
          <img
            src={assigneeAvatar}
            alt=""
            loading="lazy"
            decoding="async"
            className="ticket-row-avatar-img"
          />
        ) : (
          <span className="ticket-row-avatar-placeholder">--</span>
        )}
      </div>

      <span className="ticket-row-date">
        {formattedDate}
      </span>
    </div>
  );
}

function shouldRerenderTicketRow(prevProps: TicketRowProps, nextProps: TicketRowProps) {
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
    prevProps.projectName === nextProps.projectName &&
    prevProps.projectColor === nextProps.projectColor
  );
}

export const TicketRow = memo(TicketRowImpl, shouldRerenderTicketRow);
