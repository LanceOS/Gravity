import { memo, useState } from 'react';
import { GitMerge, GitPullRequest, Paperclip } from 'lucide-react';
import { Card, Avatar, Badge, Flex } from '@library';
import type { TicketCardProps } from '../types/TicketBoard';

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
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      className="clickable"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      bodyStyle={{ padding: 0 }}
      style={{
        backgroundColor: isHovered ? 'var(--color-surface-overlay)' : 'var(--color-surface-card)',
        border: '1px solid var(--color-border-default)',
        borderLeft: `3px solid ${priorityColor}`,
        borderRadius: '6px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        cursor: 'grab',
        transition: 'all var(--transition-normal)',
        borderColor: isHovered ? 'var(--color-border-focus)' : 'var(--color-border-default)',
      }}
    >
      <Flex align="center" justify="space-between">
        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--color-text-disabled)' }}>
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
        style={{
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
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

      <Flex
        align="center"
        justify="space-between"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.01)',
          paddingTop: '8px',
          marginTop: '2px',
        }}
      >
        <Flex align="center" gap="8px">
          <Flex align="center">{priorityIcon}</Flex>

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

export const TicketCard = memo(TicketCardImpl);