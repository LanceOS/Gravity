import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface KanbanCard {
  id: string;
  status: string;
  title?: string;
  content: React.ReactNode;
}

export interface KanbanBoardProps {
  columns: { id: string; title: string }[];
  cards: KanbanCard[];
  onCardMove?: (cardId: string, nextStatus: string) => void;
  renderColumnHeader?: (columnId: string, title: string, count: number) => React.ReactNode;
  style?: React.CSSProperties;
}

export function KanbanBoard({ columns, cards, onCardMove, renderColumnHeader, style }: KanbanBoardProps) {
  return (
    <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', width: '100%', height: '100%', minHeight: '320px', ...style }}>
      {columns.map((col) => {
        const colCards = cards.filter((card) => card.status === col.id);
        return (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const cardId = e.dataTransfer.getData('text/plain');
              if (cardId && onCardMove) {
                onCardMove(cardId, col.id);
              }
            }}
            style={{
              flex: 1,
              minWidth: '240px',
              backgroundColor: 'var(--color-base100)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {renderColumnHeader ? (
              renderColumnHeader(col.id, col.title, colCards.length)
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>{col.title}</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'var(--color-border-default)',
                    color: 'var(--color-text-disabled)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  {colCards.length}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flexGrow: 1 }}>
              {colCards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', card.id);
                  }}
                  style={{
                    backgroundColor: card.title ? 'var(--color-surface-card)' : 'transparent',
                    border: card.title ? '1px solid var(--color-border-default)' : 'none',
                    borderRadius: card.title ? 'var(--radius-md)' : '0',
                    padding: card.title ? '12px' : '0',
                    boxShadow: card.title ? 'var(--shadow-sm)' : 'none',
                    cursor: 'grab',
                    transition: 'all var(--transition-normal)',
                  }}
                >
                  {card.title && <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '6px' }}>{card.title}</div>}
                  <div>{card.content}</div>
                </div>
              ))}
              {colCards.length === 0 && (
                <div
                  style={{
                    border: '1px dashed var(--color-border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '24px 12px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: 'var(--color-text-disabled)',
                    opacity: 0.6,
                  }}
                >
                  No tickets
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
