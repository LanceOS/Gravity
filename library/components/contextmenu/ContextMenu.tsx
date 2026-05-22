import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface ContextMenuProps {
  children: React.ReactNode;
  items: ContextMenuItem[];
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setPos({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  };

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div onContextMenu={handleContextMenu} style={{ display: 'contents' }}>
        {children}
        {isOpen && (
          <Portal>
            <div
              style={{
                position: 'fixed',
                top: `${pos.y}px`,
                left: `${pos.x}px`,
                zIndex: 2000,
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                padding: '4px',
                minWidth: 'max-content',
              }}
            >
              {items.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    item.onClick?.();
                    setIsOpen(false);
                  }}
                  className="clickable"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: 'var(--text-heading)',
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </Portal>
        )}
      </div>
    </ClickAwayListener>
  );
}
