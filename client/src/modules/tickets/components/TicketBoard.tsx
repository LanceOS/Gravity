import React, { DragEvent, useCallback, useMemo } from 'react';
import type { Ticket } from '../../../context/TicketContext';
import { BOARD_COLUMNS } from '../utils/ticketView';
import { Button, KanbanBoard, Flex } from '@library';
import { Plus } from 'lucide-react';
import { TicketCard } from './TicketCard';

import type { TicketBoardProps } from '../types/TicketBoard';
import { getAssigneeAvatar, getDomainMeta, getPriorityColor, getPriorityIcon } from '../utils/TicketBoard';

export const TicketBoard: React.FC<TicketBoardProps> = ({
  ticketsByColumn,
  domainById,
  userAvatarById,
  onMoveTicket,
  onSelectTicket,
  onOpenCreateTicket,
}) => {
  const handleDragStart = useCallback((event: DragEvent, ticketId: string) => {
    event.dataTransfer.setData('text/plain', ticketId);
  }, []);

  const renderColumnHeader = useCallback((columnId: string, title: string, count: number) => {
    const col = BOARD_COLUMNS.find((c) => c.id === columnId);
    return (
      <Flex
        align="center"
        gap="8px"
        style={{
          padding: '10px 20px 8px 20px',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col?.color }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {title}
        </span>
        <span
          style={{
            fontSize: '10px',
            color: 'var(--color-text-disabled)',
            background: 'var(--color-base50)',
            padding: '1px 6px',
            borderRadius: '4px',
            marginLeft: '4px'
          }}
        >
          {count}
        </span>

        <Button
          onClick={() => onOpenCreateTicket(columnId as Ticket['status'])}
          variant="ghost"
          size="sm"
          aria-label={`Create ticket in ${title}`}
          style={{
            marginLeft: 'auto',
            color: 'var(--color-text-disabled)',
            width: '20px',
            minHeight: '20px',
            padding: 0,
            border: 'none'
          }}
        >
          <Plus size={14} />
        </Button>
      </Flex>
    );
  }, [onOpenCreateTicket]);

  const formattedCards = useMemo(() => {
    return BOARD_COLUMNS.flatMap((col) => {
      const colTickets = ticketsByColumn[col.id] || [];
      return colTickets.map((ticket) => {
        const domainMeta = getDomainMeta(domainById, ticket.domainId);
        return {
          id: ticket.id,
          status: ticket.status,
          content: (
            <TicketCard
              ticket={ticket}
              onClick={() => onSelectTicket(ticket)}
              onDragStart={(e) => handleDragStart(e, ticket.id)}
              priorityIcon={getPriorityIcon(ticket.priority)}
              priorityColor={getPriorityColor(ticket.priority)}
              domainColor={domainMeta.color}
              domainName={domainMeta.name}
              assigneeAvatar={getAssigneeAvatar(userAvatarById, ticket.assigneeId)}
            />
          ),
        };
      });
    });
  }, [ticketsByColumn, domainById, userAvatarById, onSelectTicket, handleDragStart]);

  const handleCardMove = useCallback((cardId: string, nextStatus: string) => {
    onMoveTicket(cardId, { status: nextStatus as Ticket['status'] });
  }, [onMoveTicket]);

  return (
    <Flex direction="column" style={{ height: '100%', flex: 1, overflow: 'hidden' }}>

      {/* Kanban Board Container */}
      <div style={{ flex: 1, overflowY: 'hidden', background: 'var(--color-surface-app)' }}>
        <KanbanBoard
          columns={BOARD_COLUMNS}
          cards={formattedCards}
          onCardMove={handleCardMove}
          renderColumnHeader={renderColumnHeader}
        />
      </div>

    </Flex>
  );
};
