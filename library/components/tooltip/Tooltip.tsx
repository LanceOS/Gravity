import React from 'react';
import { Portal, runAnime } from '../../utilities';
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
              position: 'absolute',
              backgroundColor: 'var(--color-text-primary)',
              color: 'var(--color-surface-app)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              zIndex: 9999,
              pointerEvents: 'none',
              ...style,
            }}
          >
            {content}
          </div>
        </Portal>
      )}
    </div>
  );
}
