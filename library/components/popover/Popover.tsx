import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../utilities/Portal';
import { FocusTrap } from '../utilities/FocusTrap';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  style?: React.CSSProperties;
}

export function Popover({ trigger, children, isOpen: controlledIsOpen, onOpenChange, style }: PopoverProps) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = React.useState(false);
  const isCurrentlyOpen = controlledIsOpen !== undefined ? controlledIsOpen : uncontrolledIsOpen;

  const setOpen = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setUncontrolledIsOpen(open);
    }
  };

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <div style={{ position: 'relative', display: 'inline-block', ...style }}>
        <div
          onClick={() => setOpen(!isCurrentlyOpen)}
          className="clickable"
          style={{ display: 'contents' }}
        >
          {trigger}
        </div>
        {isCurrentlyOpen && (
          <div
            role="dialog"
            className="lib-animate-fade-in"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: 'var(--space-3)',
              minWidth: '200px',
              marginTop: '8px',
            }}
          >
            {children}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}
