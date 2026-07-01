import { memo } from 'react';
import { GitMerge, GitPullRequest, Paperclip } from 'lucide-react';
import { Card, Avatar, Badge, Flex } from '@library';
import type { TicketCardProps } from '../types/TicketBoard';
import { TicketRelationIndicators } from './TicketRelationIndicators';
import { TicketStatusBadge } from './TicketStatusBadge';
import { getPriorityIcon } from '../../../utils/ticketPresentation';
import './TicketCard.css';

type TicketLabelList = TicketCardProps['ticket']['labels'];

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

function TicketCardImpl({
  ticket,
  onClick,
  onDragStart,
  priorityIcon,
  priority,
  priorityColor,
  assigneeAvatar,
}: TicketCardProps) {
  const isCompleted = ticket.status === 'done' || ticket.status === 'canceled';
  const truncatedTitle = ticket.title.length > 150 ? `${ticket.title.slice(0, 149)}…` : ticket.title;
  const renderedPriorityIcon = priorityIcon ?? getPriorityIcon(priority);

  return (
    <Card
      className="ticket-card clickable"
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      bodyStyle={{ padding: 0 }}
      style={{
        borderLeft: `3px solid ${priorityColor}`,
        cursor: 'grab',
      }}
    >
      <Flex align="center" justify="space-between">
        <span className="ticket-card__key">
          {ticket.key}
        </span>

        <Flex align="center" gap="6px">
          {ticket.parentId ? <Paperclip size={10} color="var(--color-text-disabled)" /> : null}

          {ticket.prStatus !== 'none' ? (
            <Badge
              variant={ticket.prStatus === 'merged' ? 'success' : 'accent'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none' }}
              title={`PR ${ticket.prStatus}`}
            >
          {ticket.prStatus === 'merged' ? <GitMerge size={12} /> : <GitPullRequest size={12} />}
              {ticket.prStatus === 'merged' ? 'Merged' : 'Active'}
            </Badge>
          ) : null}
        </Flex>
      </Flex>

        <div
          className="ticket-card__title-line"
        >
          <TicketStatusBadge status={ticket.status} />

          <div
            className="ticket-card__title"
            style={{
              color: isCompleted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
              textDecoration: isCompleted ? 'line-through' : 'none',
              opacity: isCompleted ? 0.85 : 1,
            }}
          >
            {truncatedTitle}
          </div>
      </div>

      <Flex
        align="center"
        justify="space-between"
        className="ticket-card__meta"
      >
        <Flex align="center" gap="8px">
          <Flex align="center">{renderedPriorityIcon}</Flex>
          <TicketRelationIndicators ticket={ticket} />

          {ticket.labels && ticket.labels.length > 0 ? (
            <Flex align="center" gap="4px" className="ticket-card__label-list">
              {ticket.labels.map((label) => (
                <div
                  key={label.id}
                  title={label.name}
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: label.color,
                  }}
                />
              ))}
            </Flex>
          ) : null}
        </Flex>

        <Avatar
          src={assigneeAvatar || undefined}
          name={ticket.assigneeId ? 'User' : undefined}
          size="sm"
        />
      </Flex>
    </Card>
  );
}

function shouldRerenderTicketCard(prevProps: TicketCardProps, nextProps: TicketCardProps) {
  const prevTicket = prevProps.ticket;
  const nextTicket = nextProps.ticket;

  return (
    prevTicket.id === nextTicket.id &&
    prevTicket.title === nextTicket.title &&
    prevTicket.key === nextTicket.key &&
    prevTicket.status === nextTicket.status &&
    prevTicket.priority === nextTicket.priority &&
    !haveLabelSetsChanged(prevTicket.labels, nextTicket.labels) &&
    prevTicket.prStatus === nextTicket.prStatus &&
    prevTicket.assigneeId === nextTicket.assigneeId &&
    prevTicket.createdAt === nextTicket.createdAt &&
    prevTicket.updatedAt === nextTicket.updatedAt &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.onDragStart === nextProps.onDragStart &&
    prevProps.priorityIcon === nextProps.priorityIcon &&
    prevProps.priorityColor === nextProps.priorityColor &&
    prevProps.assigneeAvatar === nextProps.assigneeAvatar
  );
}

export const TicketCard = memo(TicketCardImpl, shouldRerenderTicketCard);
