import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../../utilities';
import { FocusTrap } from '../../utilities';
import { ClickAwayListener } from '../../utilities';
import './Popover.css';

export interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  style?: React.CSSProperties;
  align?: 'left' | 'right' | 'center';
  contentClassName?: string;
}

export function Popover({ trigger, children, isOpen: controlledIsOpen, onOpenChange, style, align = 'left', contentClassName = '' }: PopoverProps) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = React.useState(false);
  const isCurrentlyOpen = controlledIsOpen !== undefined ? controlledIsOpen : uncontrolledIsOpen;

  const triggerRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const [renderState, setRenderState] = React.useState({
    isOpen: isCurrentlyOpen,
    shouldRender: isCurrentlyOpen,
    isAnimatingOut: false,
  });

  if (isCurrentlyOpen !== renderState.isOpen) {
    setRenderState({
      isOpen: isCurrentlyOpen,
      shouldRender: isCurrentlyOpen ? true : renderState.shouldRender,
      isAnimatingOut: !isCurrentlyOpen,
    });
  }

  const { shouldRender, isAnimatingOut } = renderState;

  const setOpen = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setUncontrolledIsOpen(open);
    }
  };

  const syncPosition = React.useCallback(() => {
    if (!triggerRef.current || !popoverRef.current || !shouldRender) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();

    const GAP = 16;
    const popoverWidth = popoverRect.width || 250;
    const popoverHeight = popoverRect.height || 200;

    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    // By default, open below. If not enough space below but enough above, flip it.
    const openAbove = spaceBelow < popoverHeight && spaceAbove > spaceBelow;

    let left = triggerRect.left;
    if (align === 'right') {
      left = triggerRect.right - popoverWidth;
    } else if (align === 'center') {
      left = triggerRect.left + (triggerRect.width / 2) - (popoverWidth / 2);
    }

    // Keep within window bounds horizontally
    left = Math.max(GAP, Math.min(left, window.innerWidth - popoverWidth - GAP));

    // Calculate vertical position
    let top = openAbove ? triggerRect.top - popoverHeight - 4 : triggerRect.bottom + 4;

    // Keep within window bounds vertically
    top = Math.max(GAP, Math.min(top, window.innerHeight - popoverHeight - GAP));

    popoverRef.current.style.position = 'fixed';
    popoverRef.current.style.left = `${left}px`;
    popoverRef.current.style.top = `${top}px`;
    popoverRef.current.style.margin = '0';
    popoverRef.current.style.maxHeight = `calc(100vh - ${GAP * 2}px)`;
    popoverRef.current.style.overflowY = 'auto';
  }, [align, shouldRender]);

  React.useLayoutEffect(() => {
    if (shouldRender) {
      syncPosition();
      window.addEventListener('resize', syncPosition);
      window.addEventListener('scroll', syncPosition, true);
    }
    return () => {
      window.removeEventListener('resize', syncPosition);
      window.removeEventListener('scroll', syncPosition, true);
    };
  }, [shouldRender, syncPosition]);

  React.useEffect(() => {
    if (shouldRender && popoverRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        syncPosition();
      });
      resizeObserver.observe(popoverRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [shouldRender, syncPosition]);

  const handleAnimationEnd = () => {
    if (!isCurrentlyOpen) {
      setRenderState((prev) => ({
        ...prev,
        shouldRender: false,
        isAnimatingOut: false,
      }));
    }
  };

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <div style={{ position: 'relative', display: 'inline-block', ...style }} ref={triggerRef}>
        <div
          onClick={() => setOpen(!isCurrentlyOpen)}
          className="clickable"
          style={{ display: 'contents' }}
        >
          {trigger}
        </div>
        {shouldRender && (
          <Portal>
            <div
              ref={popoverRef}
              role="dialog"
              onAnimationEnd={handleAnimationEnd}
              className={`popover-content popover-content--align-${align} ${isAnimatingOut ? 'lib-animate-fade-out-up' : 'lib-animate-fade-in-down'} ${contentClassName}`}
              style={{ zIndex: 1700 }}
            >
              {children}
            </div>
          </Portal>
        )}
      </div>
    </ClickAwayListener>
  );
}
