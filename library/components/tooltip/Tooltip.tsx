import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../../utilities';
import { FocusTrap } from '../../utilities';
import { ClickAwayListener } from '../../utilities';
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
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (show) {
      setIsRendered(true);
    } else if (isRendered) {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        setIsRendered(false);
      } else if (shouldReduceMotion()) {
        setIsRendered(false);
      } else {
        if (tooltipRef.current) {
          anime({
            targets: tooltipRef.current,
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
  }, [show, isRendered]);

  React.useLayoutEffect(() => {
    if (show && isRendered && tooltipRef.current) {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        return;
      }
      if (shouldReduceMotion()) {
        return;
      }
      tooltipRef.current.style.opacity = '0';
      tooltipRef.current.style.transform = 'translateY(4px)';
      anime({
        targets: tooltipRef.current,
        opacity: [0, 1],
        translateY: [4, 0],
        duration: TOOLTIP_DURATION,
        easing: TOOLTIP_EASING,
      });
    }
  }, [show, isRendered]);

  React.useEffect(() => {
    return () => {
      if (tooltipRef.current) {
        anime.remove(tooltipRef.current);
      }
    };
  }, []);

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
            ref={tooltipRef}
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
