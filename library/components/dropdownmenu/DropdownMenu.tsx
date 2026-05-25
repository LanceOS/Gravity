import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
}

export function DropdownMenu({ trigger, children }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div onClick={() => setIsOpen(!isOpen)} className="clickable" style={{ display: 'contents' }}>
          {trigger}
        </div>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              zIndex: 1000,
              backgroundColor: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: '4px',
              minWidth: 'max-content',
              marginTop: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {children}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}
