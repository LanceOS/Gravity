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
      } else {
        if (tooltipRef.current) {
          anime({
            targets: tooltipRef.current,
            opacity: [1, 0],
            scale: [1, 0.95],
            duration: 100,
            easing: 'easeInQuad',
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
      tooltipRef.current.style.opacity = '0';
      tooltipRef.current.style.transform = 'scale(0.95)';
      anime({
        targets: tooltipRef.current,
        opacity: [0, 1],
        scale: [0.95, 1],
        duration: 120,
        easing: 'easeOutQuad',
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
              boxShadow: 'var(--shadow-sm)',
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
