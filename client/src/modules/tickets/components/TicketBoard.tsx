import React, { DragEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { Ticket } from '../../../context/TicketContext';
import { BOARD_COLUMNS } from '../utils/ticketView';
import { Button, KanbanBoard, Flex } from '@library';
import { Plus } from 'lucide-react';
import { TicketCard } from './TicketCard';
import { TicketContextMenu } from './TicketContextMenu';

import type { TicketBoardProps } from '../types/TicketBoard';
import { getAssigneeAvatar, getPriorityColor, getPriorityIcon } from '../utils/TicketBoard';

const INITIAL_CARDS_PER_COLUMN = 40;
const LOAD_MORE_CARDS = 40;

export const TicketBoard = React.memo(({
  ticketsByColumn,
  availableTickets,
  userAvatarById,
  onMoveTicket,
  onSelectTicket,
  onOpenCreateTicket,
  onLoadMore,
  hasMoreRows,
  isLoadingMoreRows,
}: TicketBoardProps) => {
  const handleDragStart = useCallback((event: DragEvent, ticketId: string) => {
    event.dataTransfer.setData('text/plain', ticketId);
  }, []);

  const [visibleByColumn, setVisibleByColumn] = useState<Record<string, number>>(() =>
    Object.fromEntries(BOARD_COLUMNS.map((column) => [column.id, INITIAL_CARDS_PER_COLUMN])) as Record<string, number>
  );

  const visibleByColumnSnapshot = useMemo(() => ticketsByColumn, [ticketsByColumn]);
  const hasMoreRowsValue = hasMoreRows || false;
  const loadingMoreRows = isLoadingMoreRows || false;

  useEffect(() => {
    setVisibleByColumn(Object.fromEntries(BOARD_COLUMNS.map((column) => [column.id, INITIAL_CARDS_PER_COLUMN])) as Record<string, number>);
  }, [visibleByColumnSnapshot]);

  const handleLoadMoreColumn = useCallback((columnId: string, totalInColumn: number) => {
    setVisibleByColumn((previous) => {
      const currentLimit = previous[columnId] ?? INITIAL_CARDS_PER_COLUMN;
      const nextLimit = Math.min(totalInColumn, currentLimit + LOAD_MORE_CARDS);
      if (nextLimit === currentLimit) {
        return previous;
      }
      return { ...previous, [columnId]: nextLimit };
    });
  }, []);

  const renderColumnHeader = useCallback((columnId: string, title: string, count: number) => {
    const col = BOARD_COLUMNS.find((c) => c.id === columnId);
    const columnCount = visibleByColumn[columnId] ?? INITIAL_CARDS_PER_COLUMN;
    const fullColumnTickets = ticketsByColumn[columnId] || [];
    const hasMoreInColumn = fullColumnTickets.length > columnCount;
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
        {hasMoreInColumn ? (
          <Button
            onClick={() => handleLoadMoreColumn(columnId, fullColumnTickets.length)}
            variant="ghost"
            size="sm"
            style={{
              color: 'var(--color-text-disabled)',
              border: '1px dashed var(--color-border-default)',
              marginLeft: '6px',
              padding: '0 6px',
              minHeight: '22px',
            }}
            disabled={loadingMoreRows}
          >
            {loadingMoreRows ? '...' : 'Show'}
          </Button>
        ) : null}
      </Flex>
    );
  }, [handleLoadMoreColumn, onOpenCreateTicket, ticketsByColumn, visibleByColumn, loadingMoreRows]);

  const formattedCards = useMemo(() => {
    return BOARD_COLUMNS.flatMap((col) => {
      const fullTickets = ticketsByColumn[col.id] || [];
      const visibleCount = visibleByColumn[col.id] ?? INITIAL_CARDS_PER_COLUMN;
      const colTickets = fullTickets.slice(0, visibleCount);
      return colTickets.map((ticket) => {
        return {
          id: ticket.id,
          status: ticket.status,
          content: (
            <TicketContextMenu ticket={ticket} availableTickets={availableTickets}>
              <TicketCard
                ticket={ticket}
                onClick={() => onSelectTicket(ticket)}
                onDragStart={(e) => handleDragStart(e, ticket.id)}
                priorityIcon={getPriorityIcon(ticket.priority)}
                priorityColor={getPriorityColor(ticket.priority)}
                assigneeAvatar={getAssigneeAvatar(userAvatarById, ticket.assigneeId)}
              />
            </TicketContextMenu>
          ),
        };
      });
    });
  }, [availableTickets, ticketsByColumn, userAvatarById, onSelectTicket, handleDragStart, visibleByColumn]);

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
      {hasMoreRowsValue ? (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border-default)' }}>
          <Button variant="secondary" onClick={onLoadMore} disabled={!onLoadMore || loadingMoreRows}>
            {loadingMoreRows ? 'Loading more tickets…' : 'Load more tickets'}
          </Button>
        </div>
      ) : null}
    </Flex>
  );
});
