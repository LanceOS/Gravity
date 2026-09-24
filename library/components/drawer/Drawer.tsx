import React from 'react';
import { X } from 'lucide-react';
import { Portal, FocusTrap, ClickAwayListener, runAnime } from '../../utilities';
import anime from 'animejs';

const DRAWER_DURATION = 190;
const DRAWER_EASING = 'cubic-bezier(0.2, 0, 0.38, 1)';

function shouldReduceMotion(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Drawer({ isOpen, onClose, title, children, style }: DrawerProps) {
  const titleId = React.useId();
  const [isRendered, setIsRendered] = React.useState(isOpen);
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const reducedMotion = shouldReduceMotion();

    if (isOpen) {
      setIsRendered(true);
      document.body.style.overflow = 'hidden';
    } else if (isRendered) {
      document.body.style.overflow = '';

      if (reducedMotion) {
        setIsRendered(false);
        return;
      }

      if (backdropRef.current) {
        anime.remove(backdropRef.current);
        runAnime({
          targets: backdropRef.current,
          opacity: [1, 0],
          duration: DRAWER_DURATION,
          easing: DRAWER_EASING,
        });
      }
      if (contentRef.current) {
        anime.remove(contentRef.current);
        runAnime({
          targets: contentRef.current,
          translateX: ['0%', '100%'],
          duration: DRAWER_DURATION,
          easing: DRAWER_EASING,
        });
      }
      window.setTimeout(() => {
        setIsRendered(false);
      }, DRAWER_DURATION);
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isRendered]);

  React.useLayoutEffect(() => {
    if (!isOpen || !isRendered || shouldReduceMotion()) {
      return;
    }

    if (backdropRef.current) {
      backdropRef.current.style.opacity = '0';
      runAnime({
        targets: backdropRef.current,
        opacity: [0, 1],
        duration: DRAWER_DURATION,
        easing: DRAWER_EASING,
      });
    }
    if (contentRef.current) {
      contentRef.current.style.transform = 'translateX(100%)';
      runAnime({
        targets: contentRef.current,
        translateX: ['100%', '0%'],
        duration: DRAWER_DURATION,
        easing: DRAWER_EASING,
      });
    }
  }, [isOpen, isRendered]);

  React.useEffect(() => {
    return () => {
      if (backdropRef.current) {
        anime.remove(backdropRef.current);
      }
      if (contentRef.current) {
        anime.remove(contentRef.current);
      }
    };
  }, []);

  if (!isRendered) return null;

  return (
    <Portal>
      <FocusTrap>
        <div
          ref={backdropRef}
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'var(--color-overlay-scrim)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: 1500,
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '12px',
          }}
        >
          <ClickAwayListener onClickAway={onClose}>
            <div
              ref={contentRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              style={{
                width: '100%',
                maxWidth: '400px',
                height: '100%',
                backgroundColor: 'var(--surface-glass-strong)',
                border: '1px solid var(--border-glass)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-xl)',
                backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
                WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
                display: 'flex',
                flexDirection: 'column',
                ...style,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '22px 24px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                {title && (
                  <h2 id={titleId} style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {title}
                  </h2>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close sidebar"
                  className="btn btn-ghost clickable"
                  style={{ padding: '6px', minHeight: 'auto', borderRadius: 'var(--radius-sm)' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ padding: '24px', overflowY: 'auto', flexGrow: 1, fontSize: '13px' }}>{children}</div>
            </div>
          </ClickAwayListener>
        </div>
      </FocusTrap>
    </Portal>
  );
}
