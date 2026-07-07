import React, { DragEvent, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { Ticket } from '../../../context/TicketContextContext';
import { BOARD_COLUMNS } from '../utils/ticketView';
import { Button, KanbanBoard, Flex } from '@library';
import { Plus } from 'lucide-react';
import { TicketCard } from './TicketCard';
import { TicketContextMenu } from './TicketContextMenu';

import type { TicketBoardProps } from '../types/TicketBoard';
import { getAssigneeAvatar, getPriorityColor } from '../utils/TicketBoard';
import { safeAnime, prefersReducedMotion } from '../../../utils/animationUtils';
import { profileComputation } from '../../../utils/performanceProfile';
import anime from 'animejs';

const INITIAL_CARDS_PER_COLUMN = 40;
const LOAD_MORE_CARDS = 40;
const TICKET_CARD_ANIMATION_DURATION = 240;
const TICKET_CARD_ANIMATION_EASING = 'cubic-bezier(0.2, 0, 0.38, 1)';
const MAX_TICKETS_FOR_BOARD_ANIMATION = 120;
const DRAG_TICKET_DATA_TYPE = 'application/x-gravity-ticket';
const BOARD_COLUMN_BY_ID = Object.fromEntries(BOARD_COLUMNS.map((column) => [column.id, column])) as Record<string, (typeof BOARD_COLUMNS)[number]>;

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
  const [visibleByColumn, setVisibleByColumn] = useState<Record<string, number>>(() =>
    Object.fromEntries(BOARD_COLUMNS.map((column) => [column.id, INITIAL_CARDS_PER_COLUMN])) as Record<string, number>
  );
  const baseVisibleByColumn = useMemo(() => Object.fromEntries(BOARD_COLUMNS.map((column) => [column.id, INITIAL_CARDS_PER_COLUMN])) as Record<string, number>, []);
  const previousVisibleCardCountRef = useRef(0);
  const selectTicketHandlerCache = useRef(new WeakMap<Ticket, () => void>());
  const dragStartHandlerCache = useRef(new WeakMap<Ticket, (event: DragEvent) => void>());

  const boardRef = useRef<HTMLDivElement>(null);
  const didRunBoardLoadAnimationRef = React.useRef(false);
  const shouldAnimateBoardLoad = (formattedCount: number) => (
    formattedCount > 0 &&
    formattedCount <= MAX_TICKETS_FOR_BOARD_ANIMATION &&
    !prefersReducedMotion()
  );
  const totalVisibleCards = useMemo(() => BOARD_COLUMNS.reduce(
    (total, column) => total + (ticketsByColumn[column.id as keyof typeof ticketsByColumn]?.length || 0),
    0
  ), [ticketsByColumn]);
  const hasMoreRowsValue = hasMoreRows || false;
  const loadingMoreRows = isLoadingMoreRows || false;

  useEffect(() => {
    setVisibleByColumn((previous) => {
      if (previousVisibleCardCountRef.current > totalVisibleCards) {
        previousVisibleCardCountRef.current = totalVisibleCards;
        return baseVisibleByColumn;
      }

      previousVisibleCardCountRef.current = totalVisibleCards;
      return previous;
    });
  }, [baseVisibleByColumn, totalVisibleCards]);

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

  const clearTicketHandlerCaches = useCallback(() => {
    selectTicketHandlerCache.current = new WeakMap<Ticket, () => void>();
    dragStartHandlerCache.current = new WeakMap<Ticket, (event: DragEvent) => void>();
  }, []);

  const getSelectTicketHandler = useCallback((ticket: Ticket) => {
    const cached = selectTicketHandlerCache.current.get(ticket);
    if (cached) {
      return cached;
    }

    const nextHandler = () => onSelectTicket(ticket);
    selectTicketHandlerCache.current.set(ticket, nextHandler);
    return nextHandler;
  }, [onSelectTicket]);

  const getDragStartHandler = useCallback((ticket: Ticket) => {
    const cached = dragStartHandlerCache.current.get(ticket);
    if (cached) {
      return cached;
    }

    const nextHandler = (event: DragEvent) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', ticket.id);
      event.dataTransfer.setData(DRAG_TICKET_DATA_TYPE, ticket.id);
    };
    dragStartHandlerCache.current.set(ticket, nextHandler);
    return nextHandler;
  }, []);

  const renderColumnHeader = useCallback((columnId: string, title: string, count: number) => {
    const col = BOARD_COLUMN_BY_ID[columnId];
    const columnCount = visibleByColumn[columnId] ?? INITIAL_CARDS_PER_COLUMN;
    const fullColumnTickets = ticketsByColumn[columnId as keyof typeof ticketsByColumn] || [];
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

  useEffect(() => {
    clearTicketHandlerCaches();
  }, [clearTicketHandlerCaches, onSelectTicket]);

  const formattedCards = useMemo(() => profileComputation('TicketBoard:formatCards', () => {
    return BOARD_COLUMNS.flatMap((col) => {
      const fullTickets = ticketsByColumn[col.id as keyof typeof ticketsByColumn] || [];
      const visibleCount = visibleByColumn[col.id] ?? INITIAL_CARDS_PER_COLUMN;
      const colTickets = fullTickets.slice(0, visibleCount);
        return colTickets.map((ticket) => {
          return {
            id: ticket.id,
            title: ticket.title,
            status: ticket.status,
            contentVersion: ticket.updatedAt,
            content: (
            <TicketContextMenu ticket={ticket} availableTickets={availableTickets}>
                <TicketCard
                  ticket={ticket}
                  onClick={getSelectTicketHandler(ticket)}
                  onDragStart={getDragStartHandler(ticket)}
                  priority={ticket.priority}
                  priorityColor={getPriorityColor(ticket.priority)}
                  assigneeAvatar={getAssigneeAvatar(userAvatarById, ticket.assigneeId)}
                />
            </TicketContextMenu>
          ),
          };
      });
    });
  }), [availableTickets, getDragStartHandler, getSelectTicketHandler, ticketsByColumn, userAvatarById, visibleByColumn]);

  const visibleCardCount = formattedCards.length;

  useEffect(() => {
    if (visibleCardCount === 0) {
      didRunBoardLoadAnimationRef.current = false;
      return;
    }

    if (didRunBoardLoadAnimationRef.current || !shouldAnimateBoardLoad(visibleCardCount)) {
      return;
    }

    if (!boardRef.current) return;

    if (prefersReducedMotion()) {
      anime.set(boardRef.current, { opacity: 1, translateY: 0 });
      return;
    }

    // Set initial state before animating
    anime.set(boardRef.current, { opacity: 0, translateY: 8 });

    safeAnime({
      targets: boardRef.current,
      opacity: [0, 1],
      translateY: [8, 0],
      duration: TICKET_CARD_ANIMATION_DURATION,
      easing: TICKET_CARD_ANIMATION_EASING,
    });
    didRunBoardLoadAnimationRef.current = true;
  }, [visibleCardCount]);

  const handleCardMove = useCallback((cardId: string, nextStatus: string) => {
    onMoveTicket(cardId, { status: nextStatus as Ticket['status'] });
  }, [onMoveTicket]);

  return (
    <Flex direction="column" style={{ height: '100%', flex: 1, overflow: 'hidden' }}>

      {/* Kanban Board Container */}
      <div ref={boardRef} style={{ flex: 1, overflowY: 'hidden', background: 'var(--color-surface-app)' }}>
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
