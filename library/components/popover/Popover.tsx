import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../../utilities';
import { FocusTrap } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

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
  const popoverRef = React.useRef<HTMLDivElement>(null);
  
  const [shouldRender, setShouldRender] = React.useState(isCurrentlyOpen);
  const [isAnimatingOut, setIsAnimatingOut] = React.useState(false);

  React.useEffect(() => {
    if (isCurrentlyOpen) {
      setShouldRender(true);
      setIsAnimatingOut(false);
    } else if (shouldRender) {
      setIsAnimatingOut(true);
    }
  }, [isCurrentlyOpen, shouldRender]);

  React.useLayoutEffect(() => {
    if (isCurrentlyOpen && popoverRef.current) {
      // Reset first to measure natural left-aligned bounds
      popoverRef.current.style.left = '0';
      popoverRef.current.style.right = 'auto';
      
      const rect = popoverRef.current.getBoundingClientRect();
      const rightOverflow = rect.right > window.innerWidth - 8;
      
      if (rightOverflow) {
        popoverRef.current.style.left = 'auto';
        popoverRef.current.style.right = '0';
      }
    }
  }, [isCurrentlyOpen]);

  const setOpen = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setUncontrolledIsOpen(open);
    }
  };

  const handleAnimationEnd = () => {
    if (!isCurrentlyOpen) {
      setShouldRender(false);
      setIsAnimatingOut(false);
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
        {shouldRender && (
          <div
            ref={popoverRef}
            role="dialog"
            onAnimationEnd={handleAnimationEnd}
            className={isAnimatingOut ? 'lib-animate-fade-out-up' : 'lib-animate-fade-in-down'}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              backgroundColor: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-default)',
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
