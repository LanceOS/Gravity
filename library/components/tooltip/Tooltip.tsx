import React from 'react';
import { Portal, getDropdownPosition, runAnime } from '../../utilities';
import anime from 'animejs';

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const TOOLTIP_DURATION = 130;
const TOOLTIP_EASING = 'cubic-bezier(0.2, 0, 0.38, 1)';

function shouldReduceMotion(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Tooltip({ content, children, style }: TooltipProps) {
  const [show, setShow] = React.useState(false);
  const [isRendered, setIsRendered] = React.useState(false);
  const [tooltipElement, setTooltipElement] = React.useState<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!isRendered || !trigger || !tooltipElement) return;

    let previousRect: DOMRect | undefined;
    const syncPosition = () => {
      // The portal lives under body, so use viewport coordinates. Layout sizes
      // exclude the entrance/exit transform and keep animation out of placement.
      const triggerRect = trigger.getBoundingClientRect();
      previousRect = triggerRect;
      const { left, top } = getDropdownPosition({
        triggerRect,
        floatingRect: { width: tooltipElement.offsetWidth, height: tooltipElement.offsetHeight },
        align: 'center',
        gap: 6,
        viewportPadding: 8,
      });
      tooltipElement.style.left = `${left}px`;
      // A multiline tooltip can fit the viewport without fitting wholly on
      // either side of its trigger. Keep its full box inside the viewport.
      const maxTop = Math.max(8, window.innerHeight - tooltipElement.offsetHeight - 8);
      tooltipElement.style.top = `${Math.max(8, Math.min(top, maxTop))}px`;
    };

    syncPosition();
    window.addEventListener('scroll', syncPosition, { capture: true, passive: true });
    window.addEventListener('resize', syncPosition);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncPosition);
    observer?.observe(trigger);
    observer?.observe(tooltipElement);
    // ResizeObserver does not report position-only changes (e.g. a sibling
    // expanding or an ancestor moving). Track those only while mounted.
    let frame: number;
    const trackPosition = () => {
      const rect = trigger.getBoundingClientRect();
      if (!previousRect || rect.left !== previousRect.left || rect.top !== previousRect.top
        || rect.width !== previousRect.width || rect.height !== previousRect.height) {
        syncPosition();
      }
      frame = window.requestAnimationFrame(trackPosition);
    };
    frame = window.requestAnimationFrame(trackPosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', syncPosition, true);
      window.removeEventListener('resize', syncPosition);
      observer?.disconnect();
    };
  }, [isRendered, tooltipElement, content, style]);

  React.useEffect(() => {
    if (show) {
      setIsRendered(true);
    } else if (isRendered) {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        setIsRendered(false);
      } else if (shouldReduceMotion()) {
        setIsRendered(false);
      } else {
        if (tooltipElement) {
          anime.remove(tooltipElement);
          runAnime({
            targets: tooltipElement,
            opacity: [1, 0],
            translateY: [0, -4],
            duration: TOOLTIP_DURATION,
            easing: TOOLTIP_EASING,
            complete: () => {
              setIsRendered(false);
            },
          });
        } else {
          setIsRendered(false);
        }
      }
    }
  }, [show, isRendered, tooltipElement]);

  React.useLayoutEffect(() => {
    if (show && isRendered && tooltipElement) {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        return;
      }
      if (shouldReduceMotion()) {
        return;
      }
      // Cancel a superseded exit so its completion cannot unmount a tooltip
      // that has already been reentered.
      anime.remove(tooltipElement);
      tooltipElement.style.opacity = '0';
      tooltipElement.style.transform = 'translateY(4px)';
      runAnime({
        targets: tooltipElement,
        opacity: [0, 1],
        translateY: [4, 0],
        duration: TOOLTIP_DURATION,
        easing: TOOLTIP_EASING,
      });
    }
  }, [show, isRendered, tooltipElement]);

  React.useEffect(() => {
    return () => {
      if (tooltipElement) {
        anime.remove(tooltipElement);
      }
    };
  }, [tooltipElement]);

  return (
    <div
      ref={triggerRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {isRendered && (
        <Portal>
          <div
            ref={setTooltipElement}
            role="tooltip"
            style={{
              backgroundColor: 'var(--color-text-primary)',
              color: 'var(--color-surface-app)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              zIndex: 9999,
              pointerEvents: 'none',
              width: 'max-content',
              maxWidth: 'calc(100vw - 16px)',
              boxSizing: 'border-box',
              overflowWrap: 'anywhere',
              ...style,
              position: 'fixed',
              right: 'auto',
              bottom: 'auto',
              margin: 0,
            }}
          >
            {content}
          </div>
        </Portal>
      )}
    </div>
  );
}
