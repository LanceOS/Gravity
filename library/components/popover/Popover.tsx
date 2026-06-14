import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ClickAwayListener, FocusTrap, Portal, getDropdownPosition } from '../../utilities';
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
    const { left, top, maxHeight } = getDropdownPosition({
      triggerRect,
      floatingRect: popoverRect,
      align,
      gap: 4,
      viewportPadding: 16,
      fallbackWidth: 250,
      fallbackHeight: 200,
    });

    popoverRef.current.style.position = 'fixed';
    popoverRef.current.style.left = `${left}px`;
    popoverRef.current.style.top = `${top}px`;
    popoverRef.current.style.margin = '0';
    popoverRef.current.style.maxHeight = `${maxHeight}px`;
    popoverRef.current.style.overflowY = 'auto';
  }, [align, shouldRender]);

  const setPopoverElement = React.useCallback((node: HTMLDivElement | null) => {
    popoverRef.current = node;

    if (node) {
      syncPosition();
    }
  }, [syncPosition]);

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
      if (typeof ResizeObserver === 'undefined') {
        return undefined;
      }

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
      <div 
        style={{ position: 'relative', display: 'inline-block', ...style }} 
        ref={triggerRef}
        onClick={() => setOpen(!isCurrentlyOpen)}
      >
        {trigger}
        {shouldRender && (
          <Portal>
            <div
              ref={setPopoverElement}
              role="dialog"
              onAnimationEnd={handleAnimationEnd}
              onClick={(e) => e.stopPropagation()}
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
