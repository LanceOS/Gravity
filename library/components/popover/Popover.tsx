import React from 'react';
import { Portal, ClickAwayListener, getDropdownPosition, runAnime } from '../../utilities';
import anime from 'animejs';
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

function shouldReduceMotion(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Popover({ trigger, children, isOpen: controlledIsOpen, onOpenChange, style, align = 'left', contentClassName = '' }: PopoverProps) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = React.useState(false);
  const isCurrentlyOpen = controlledIsOpen !== undefined ? controlledIsOpen : uncontrolledIsOpen;

  const triggerRef = React.useRef<HTMLDivElement>(null);
  const [popoverElement, setPopoverElement] = React.useState<HTMLDivElement | null>(null);

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
    if (!triggerRef.current || !popoverElement || !shouldRender) return;

    // Clear alignment CSS offsets before measuring the portal in viewport coordinates.
    popoverElement.style.position = 'fixed';
    popoverElement.style.right = 'auto';
    popoverElement.style.margin = '0';
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverRect = popoverElement.getBoundingClientRect();
    const { left, top, maxHeight } = getDropdownPosition({
      triggerRect,
      floatingRect: popoverRect,
      align,
      gap: 4,
      viewportPadding: 16,
      fallbackWidth: 250,
      fallbackHeight: 200,
    });

    popoverElement.style.left = `${left}px`;
    popoverElement.style.top = `${top}px`;
    popoverElement.style.maxHeight = `${maxHeight}px`;
    popoverElement.style.overflowY = 'auto';
  }, [align, shouldRender, popoverElement]);

  const handleViewportChange = React.useCallback(
    (event?: Event) => {
      if (event instanceof Event) {
        const target = event.target;
        if (target instanceof Node && popoverElement?.contains(target)) {
          return;
        }
      }

      syncPosition();
    },
    [syncPosition, popoverElement]
  );

  React.useLayoutEffect(() => {
    if (shouldRender) {
      handleViewportChange();
      window.addEventListener('resize', syncPosition);
      window.addEventListener('scroll', handleViewportChange, true);
    }
    return () => {
      window.removeEventListener('resize', syncPosition);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [shouldRender, handleViewportChange, syncPosition]);

  React.useEffect(() => {
    if (shouldRender && popoverElement) {
      if (typeof ResizeObserver === 'undefined') {
        return undefined;
      }

      const resizeObserver = new ResizeObserver(() => {
        syncPosition();
      });
      resizeObserver.observe(popoverElement);
      return () => resizeObserver.disconnect();
    }
  }, [shouldRender, syncPosition, popoverElement]);

  React.useLayoutEffect(() => {
    if (!shouldRender || isAnimatingOut || !popoverElement) {
      return;
    }

    if (shouldReduceMotion()) {
      return;
    }

    popoverElement.style.opacity = '0';
    popoverElement.style.transform = 'translateY(-4px)';
    anime.remove(popoverElement);
    runAnime({
      targets: popoverElement,
      opacity: [0, 1],
      translateY: [-4, 0],
      duration: 150,
      easing: 'cubic-bezier(0.2, 0, 0.38, 1)',
    });
  }, [shouldRender, isAnimatingOut, popoverElement]);

  React.useEffect(() => {
    if (!isAnimatingOut || !popoverElement) {
      return;
    }

    if (shouldReduceMotion()) {
      setRenderState((prev) => ({
        ...prev,
        shouldRender: false,
        isAnimatingOut: false,
      }));
      return;
    }

    anime.remove(popoverElement);
    runAnime({
      targets: popoverElement,
      opacity: [1, 0],
      translateY: [0, -4],
      duration: 130,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      complete: () => {
        setRenderState((prev) => ({
          ...prev,
          shouldRender: false,
          isAnimatingOut: false,
        }));
      },
    });
  }, [isAnimatingOut, popoverElement]);

  React.useEffect(() => {
    return () => {
      if (popoverElement) {
        anime.remove(popoverElement);
      }
    };
  }, [popoverElement]);

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
              onClick={(e) => e.stopPropagation()}
              className={`popover-content popover-content--align-${align} ${contentClassName}`}
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
