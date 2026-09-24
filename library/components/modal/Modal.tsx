import React from 'react';
import { X } from 'lucide-react';
import { Portal, FocusTrap, ClickAwayListener, runAnime } from '../../utilities';
import anime from 'animejs';

const MODAL_DURATION = 180;
const MODAL_EASING = 'cubic-bezier(0.2, 0, 0.38, 1)';

function shouldReduceMotion(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Modal({ isOpen, onClose, title, children, footer, style }: ModalProps) {
  const [isRendered, setIsRendered] = React.useState(isOpen);
  // Portal mounts after our first commit; start animations when its DOM is attached.
  const [backdropElement, setBackdropElement] = React.useState<HTMLDivElement | null>(null);
  const [dialogElement, setDialogElement] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const reducedMotion = shouldReduceMotion();
    let closeTimeout: number | undefined;

    if (isOpen) {
      setIsRendered(true);
      document.body.style.overflow = 'hidden';
    } else if (isRendered) {
      document.body.style.overflow = '';

      if (reducedMotion) {
        setIsRendered(false);
        return;
      }

      if (backdropElement) {
        anime.remove(backdropElement);
        runAnime({
          targets: backdropElement,
          opacity: [1, 0],
          duration: MODAL_DURATION,
          easing: MODAL_EASING,
        });
      }
      if (dialogElement) {
        anime.remove(dialogElement);
        runAnime({
          targets: dialogElement,
          opacity: [1, 0],
          translateY: ['0px', '10px'],
          duration: MODAL_DURATION,
          easing: MODAL_EASING,
        });
      }

      closeTimeout = window.setTimeout(() => {
        setIsRendered(false);
      }, MODAL_DURATION);
    }

    return () => {
      window.clearTimeout(closeTimeout);
      document.body.style.overflow = '';
    };
  }, [isOpen, isRendered, backdropElement, dialogElement]);

  React.useLayoutEffect(() => {
    if (!isOpen || !isRendered || shouldReduceMotion()) {
      return;
    }

    if (backdropElement) {
      anime.remove(backdropElement);
      backdropElement.style.opacity = '0';
      runAnime({
        targets: backdropElement,
        opacity: [0, 1],
        duration: MODAL_DURATION,
        easing: MODAL_EASING,
      });
    }
    if (dialogElement) {
      anime.remove(dialogElement);
      dialogElement.style.opacity = '0';
      dialogElement.style.transform = 'translateY(10px)';
      runAnime({
        targets: dialogElement,
        opacity: [0, 1],
        translateY: ['10px', '0px'],
        duration: MODAL_DURATION,
        easing: MODAL_EASING,
      });
    }
  }, [isOpen, isRendered, backdropElement, dialogElement]);

  React.useEffect(() => {
    return () => {
      if (backdropElement) {
        anime.remove(backdropElement);
      }
      if (dialogElement) {
        anime.remove(dialogElement);
      }
    };
  }, [backdropElement, dialogElement]);

  if (!isRendered) return null;

  return (
    <Portal>
      <FocusTrap>
        <div
          ref={setBackdropElement}
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
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <ClickAwayListener onClickAway={onClose}>
            <div
              ref={setDialogElement}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? 'modal-title' : undefined}
              style={{
                width: '100%',
                maxWidth: '500px',
                backgroundColor: 'var(--surface-glass-strong)',
                border: '1px solid var(--border-glass)',
                boxShadow: 'var(--shadow-xl)',
                backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
                WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
                borderRadius: 'var(--radius-xl)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 'calc(100vh - 32px)',
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
                  <h2 id="modal-title" style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {title}
                  </h2>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="btn btn-ghost clickable"
                  style={{ padding: '6px', minHeight: 'auto', borderRadius: 'var(--radius-sm)' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ padding: '24px', overflowY: 'auto', flexGrow: 1, fontSize: '13px' }}>{children}</div>

              {footer && (
                <div
                  style={{
                    padding: '16px 24px',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    backgroundColor: 'var(--surface-glass-strong)',
                    borderBottomLeftRadius: 'var(--radius-xl)',
                    borderBottomRightRadius: 'var(--radius-xl)',
                  }}
                >
                  {footer}
                </div>
              )}
            </div>
          </ClickAwayListener>
        </div>
      </FocusTrap>
    </Portal>
  );
}
