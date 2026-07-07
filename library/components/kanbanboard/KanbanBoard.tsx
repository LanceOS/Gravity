import React, { memo, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import anime from 'animejs';
import { DenseVirtualList } from '../densevirtuallist';
import './KanbanBoard.css';

export interface KanbanCard {
  id: string;
  status: string;
  title?: string;
  content: React.ReactNode;
  contentVersion?: string | number;
}

export interface KanbanBoardProps {
  columns: { id: string; title: string }[];
  cards: KanbanCard[];
  onCardMove?: (cardId: string, nextStatus: string) => void;
  renderColumnHeader?: (columnId: string, title: string, count: number) => React.ReactNode;
  style?: React.CSSProperties;
}

interface KanbanCardComponentProps {
  card: KanbanCard;
  isLastDropped: boolean;
  onClearLastDropped: () => void;
  onDragStartCard: (cardId: string) => void;
  onDragEndCard: () => void;
}

const KANBAN_BOARD_VIRTUAL_THRESHOLD = 50;
const KANBAN_BOARD_VIRTUAL_ROW_BUFFER = 6;
const KANBAN_CARD_BASE_HEIGHT = 128;
const KANBAN_CARD_LONG_TITLE_HEIGHT = 144;
const KANBAN_CARD_LONG_LONG_TITLE_HEIGHT = 160;
const DRAG_DATA_TYPES = ['text/plain', 'application/x-gravity-ticket'] as const;
const DRAG_DATA_TYPE_TEXT = 'text';
const DRAG_DATA_TYPE_TICKET = 'application/x-gravity-ticket';

function getKanbanCardIdFromDragEvent(event: React.DragEvent): string {
  const explicitCardId = DRAG_DATA_TYPES.reduce((foundId, type) => {
    if (foundId) {
      return foundId;
    }
    return event.dataTransfer.getData(type);
  }, '');

  if (explicitCardId) {
    return explicitCardId;
  }

  return event.dataTransfer.getData(DRAG_DATA_TYPE_TEXT);
}

function getKanbanCardRowHeight(card: KanbanCard) {
  const titleLength = card.title ? card.title.length : 0;
  if (titleLength > 200) {
    return KANBAN_CARD_LONG_LONG_TITLE_HEIGHT;
  }
  if (titleLength > 140) {
    return KANBAN_CARD_LONG_TITLE_HEIGHT;
  }
  return KANBAN_CARD_BASE_HEIGHT;
}

const KanbanCardComponent = memo(function KanbanCardComponent({
  card,
  isLastDropped,
  onClearLastDropped,
  onDragStartCard,
  onDragEndCard,
}: KanbanCardComponentProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const isTextCard = typeof card.content === 'string' || typeof card.content === 'number';

  useEffect(() => {
    if (isLastDropped && cardRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReduced) {
        anime({
          targets: cardRef.current,
          translateY: [-2, 0],
          duration: 300,
          easing: 'cubic-bezier(0.2, 0, 0.38, 1)',
        });
      }
      onClearLastDropped();
    }
  }, [isLastDropped, onClearLastDropped]);

  const cardStyle: React.CSSProperties = isTextCard
    ? {
        backgroundColor: card.title ? 'var(--color-surface-card)' : 'transparent',
        border: card.title ? '1px solid var(--color-border-default)' : 'none',
        borderRadius: card.title ? 'var(--radius-md)' : '0',
        padding: card.title ? '12px' : '0',
        boxShadow: card.title ? 'var(--shadow-sm)' : 'none',
        cursor: 'grab',
        contain: 'layout style',
        contentVisibility: 'auto',
        containIntrinsicSize: '160px',
      }
    : {
        width: '100%',
        cursor: 'grab',
        padding: 0,
        margin: 0,
        background: 'transparent',
        border: 'none',
        borderRadius: '0',
        boxShadow: 'none',
        contain: 'layout style',
        contentVisibility: 'auto',
        containIntrinsicSize: '160px',
      };

  const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    onDragStartCard(card.id);
    event.dataTransfer.setData('text/plain', card.id);
    event.dataTransfer.setData(DRAG_DATA_TYPE_TICKET, card.id);
    event.dataTransfer.effectAllowed = 'move';
  }, [card.id, onDragStartCard]);

  const handleDragEnd = useCallback(() => {
    onDragEndCard();
  }, [onDragEndCard]);

  return (
    <div
      ref={cardRef}
      draggable
      onDragStartCapture={handleDragStart}
      onDragEndCapture={handleDragEnd}
      style={{
        transition: 'border-color var(--transition-normal)',
        ...cardStyle,
      }}
    >
      {isTextCard ? (
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
          {card.title}
        </div>
      ) : null}
      <div>{card.content}</div>
    </div>
  );
}, shouldRerenderKanbanCard);

function shouldRerenderKanbanCard(prev: KanbanCardComponentProps, next: KanbanCardComponentProps) {
  const prevContentIdentity = prev.card.contentVersion ?? prev.card.content;
  const nextContentIdentity = next.card.contentVersion ?? next.card.content;

  return prev.card.id === next.card.id
    && prev.card.status === next.card.status
    && prev.isLastDropped === next.isLastDropped
    && prevContentIdentity === nextContentIdentity;
}

interface KanbanColumnProps {
  column: {
    id: string;
    title: string;
  };
  cards: KanbanCard[];
  isDragOver: boolean;
  renderColumnHeader?: (columnId: string, title: string, count: number) => React.ReactNode;
  lastDroppedCardId: string | null;
  onClearLastDropped: () => void;
  onDragStartCard: (cardId: string) => void;
  onDragEndCard: () => void;
  onDrop: (cardId: string, columnId: string) => void;
  onDropComplete: () => void;
  onDragEnter: (columnId: string) => void;
  onDragLeave: (columnId: string, event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent, columnId: string) => void;
  getActiveDragCardId: () => string;
}

const KanbanColumn = memo(function KanbanColumn({
  column,
  cards,
  isDragOver,
  renderColumnHeader,
  lastDroppedCardId,
  onClearLastDropped,
  onDragStartCard,
  onDragEndCard,
  onDrop,
  onDropComplete,
  onDragEnter,
  onDragLeave,
  onDragOver,
  getActiveDragCardId,
}: KanbanColumnProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateHeight = () => {
      setBodyHeight(node.clientHeight);
    };

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(node);
    updateHeight();

    return () => resizeObserver.disconnect();
  }, []);

  const showVirtualCards = cards.length > KANBAN_BOARD_VIRTUAL_THRESHOLD && bodyHeight > 0;

  const renderVirtualCard = useCallback((card: KanbanCard, _index: number, style: React.CSSProperties) => (
    <div key={card.id} style={{ ...style, paddingRight: '2px', boxSizing: 'border-box' }}>
      <KanbanCardComponent
        card={card}
        isLastDropped={card.id === lastDroppedCardId}
        onClearLastDropped={onClearLastDropped}
        onDragStartCard={onDragStartCard}
        onDragEndCard={onDragEndCard}
      />
    </div>
  ), [lastDroppedCardId, onClearLastDropped, onDragEndCard, onDragStartCard]);

  const cardStack = showVirtualCards ? (
    <DenseVirtualList
      items={cards}
      height={bodyHeight}
      rowHeight={getKanbanCardRowHeight}
      buffer={KANBAN_BOARD_VIRTUAL_ROW_BUFFER}
      renderRow={renderVirtualCard}
      containerStyle={{
        border: 'none',
        borderRadius: '0',
        backgroundColor: 'transparent',
      }}
    />
  ) : (
    <div className="kanban-board__cards-list">
      {cards.map((card) => (
        <KanbanCardComponent
          key={card.id}
          card={card}
          isLastDropped={card.id === lastDroppedCardId}
          onClearLastDropped={onClearLastDropped}
          onDragStartCard={onDragStartCard}
          onDragEndCard={onDragEndCard}
        />
      ))}
    </div>
  );

  const noTicketsIndicator = cards.length === 0 ? (
    <div className="kanban-board__empty">
      No tickets
    </div>
  ) : null;

  const headerNode = renderColumnHeader
    ? renderColumnHeader(column.id, column.title, cards.length)
    : (
      <div className="kanban-board__header">
        <span>{column.title}</span>
        <span>{cards.length}</span>
      </div>
    );

  return (
    <div
      className={`kanban-board__column ${isDragOver ? 'kanban-board__column--over' : ''}`}
      onDragOver={(event) => onDragOver(event, column.id)}
      onDragEnter={() => onDragEnter(column.id)}
      onDragLeave={(event) => onDragLeave(column.id, event)}
      onDrop={(event) => {
        event.preventDefault();
        const cardId = getKanbanCardIdFromDragEvent(event) || getActiveDragCardId();
        if (cardId) {
          onDrop(cardId, column.id);
        }
        onDropComplete();
      }}
    >
      {headerNode}

      <div
        className="kanban-board__cards"
        ref={bodyRef}
        onDragOver={(event) => onDragOver(event, column.id)}
        onDragEnter={() => onDragEnter(column.id)}
        onDragLeave={(event) => onDragLeave(column.id, event)}
      >
        {showVirtualCards || cards.length > 0 ? cardStack : noTicketsIndicator}
      </div>
    </div>
  );
});

export const KanbanBoard = memo(function KanbanBoard({
  columns,
  cards,
  onCardMove,
  renderColumnHeader,
  style,
}: KanbanBoardProps) {
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [lastDroppedCardId, setLastDroppedCardId] = useState<string | null>(null);
  const dragOverRafRef = useRef<number | null>(null);
  const pendingDragOverColIdRef = useRef<string | null>(null);
  const activeDragCardIdRef = useRef<string | null>(null);
  const clearLastDropped = useCallback(() => {
    setLastDroppedCardId(null);
  }, []);

  const handleCardDragStart = useCallback((cardId: string) => {
    activeDragCardIdRef.current = cardId;
  }, []);

  const clearActiveDragCard = useCallback(() => {
    activeDragCardIdRef.current = null;
  }, []);

  const getActiveDragCardId = useCallback(() => activeDragCardIdRef.current ?? '', []);

  const flushDragOverUpdate = useCallback(() => {
    if (dragOverRafRef.current !== null) {
      return;
    }

    dragOverRafRef.current = window.requestAnimationFrame(() => {
      dragOverRafRef.current = null;
      const next = pendingDragOverColIdRef.current;
      pendingDragOverColIdRef.current = null;

      setDragOverColId((previous) => (previous === next ? previous : next));
    });
  }, []);

  const queueDragOverColumn = useCallback((columnId: string | null) => {
    if (pendingDragOverColIdRef.current === columnId) {
      return;
    }

    pendingDragOverColIdRef.current = columnId;
    flushDragOverUpdate();
  }, [flushDragOverUpdate]);

  const clearDragOverColumn = useCallback(() => {
    pendingDragOverColIdRef.current = null;
    if (dragOverRafRef.current !== null) {
      window.cancelAnimationFrame(dragOverRafRef.current);
      dragOverRafRef.current = null;
    }
    clearActiveDragCard();
    setDragOverColId(null);
  }, [clearActiveDragCard]);

  const cardStatusById = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of cards) {
      map.set(card.id, card.status);
    }
    return map;
  }, [cards]);

  const handleDrop = useCallback((cardId: string, columnId: string) => {
    const sourceStatus = cardStatusById.get(cardId);
    if (!sourceStatus || sourceStatus === columnId) {
      return;
    }

    if (!onCardMove) {
      return;
    }

    setLastDroppedCardId(cardId);
    onCardMove(cardId, columnId);
  }, [cardStatusById, onCardMove]);

  const cardsByColumn = useMemo(() => {
    const buckets = new Map<string, KanbanCard[]>();

    columns.forEach((column) => {
      buckets.set(column.id, []);
    });

    cards.forEach((card) => {
      const bucket = buckets.get(card.status) || [];
      bucket.push(card);
      buckets.set(card.status, bucket);
    });

    return buckets;
  }, [cards, columns]);

  const handleDragOver = useCallback((event: React.DragEvent, columnId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    queueDragOverColumn(columnId);
  }, [queueDragOverColumn]);

  const handleDragEnter = useCallback((columnId: string) => {
    queueDragOverColumn(columnId);
  }, [queueDragOverColumn]);

  const handleDragLeave = useCallback((columnId: string, event: React.DragEvent) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      queueDragOverColumn(null);
    }
  }, [queueDragOverColumn]);

  useEffect(() => {
    return () => {
      if (dragOverRafRef.current !== null) {
        window.cancelAnimationFrame(dragOverRafRef.current);
        dragOverRafRef.current = null;
      }
    };
  }, []);

  return (
    <div className="kanban-board" style={style}>
      {columns.map((col) => {
        const colCards = cardsByColumn.get(col.id) || [];

        return (
          <KanbanColumn
            key={col.id}
            column={col}
            cards={colCards}
            isDragOver={dragOverColId === col.id}
            renderColumnHeader={renderColumnHeader}
            lastDroppedCardId={lastDroppedCardId}
            onClearLastDropped={clearLastDropped}
            onDragStartCard={handleCardDragStart}
            onDragEndCard={clearActiveDragCard}
            onDrop={handleDrop}
            onDropComplete={clearDragOverColumn}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            getActiveDragCardId={getActiveDragCardId}
          />
        );
      })}
    </div>
  );
});
