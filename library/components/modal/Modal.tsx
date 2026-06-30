import React from 'react';
import { X } from 'lucide-react';
import { Portal } from '../../utilities';
import { FocusTrap } from '../../utilities';
import { ClickAwayListener } from '../../utilities';
import anime from 'animejs';

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
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (isRendered) {
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
          setIsRendered(false);
        } else {
          if (backdropRef.current) {
            anime.remove(backdropRef.current);
            anime({
              targets: backdropRef.current,
              opacity: [1, 0],
              duration: 75,
              easing: 'linear',
            });
          }
          if (dialogRef.current) {
            anime.remove(dialogRef.current);
            anime({
              targets: dialogRef.current,
              opacity: [1, 0],
              translateY: ['0px', '16px'],
              duration: 75,
              easing: 'easeInQuad',
            });
          }
          setTimeout(() => {
            setIsRendered(false);
          }, 75);
        }
      }
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isRendered]);

  React.useLayoutEffect(() => {
    if (isOpen && isRendered) {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        return;
      }
      if (backdropRef.current) {
        backdropRef.current.style.opacity = '0';
        anime({
          targets: backdropRef.current,
          opacity: [0, 1],
          duration: 75,
          easing: 'linear',
        });
      }
      if (dialogRef.current) {
        dialogRef.current.style.opacity = '0';
        dialogRef.current.style.transform = 'translateY(16px)';
        anime({
          targets: dialogRef.current,
          opacity: [0, 1],
          translateY: ['16px', '0px'],
          duration: 75,
          easing: 'easeOutQuad',
        });
      }
    }
  }, [isOpen, isRendered]);

  React.useEffect(() => {
    return () => {
      if (backdropRef.current) {
        anime.remove(backdropRef.current);
      }
      if (dialogRef.current) {
        anime.remove(dialogRef.current);
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
            backdropFilter: 'blur(4px)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <ClickAwayListener onClickAway={onClose}>
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? 'modal-title' : undefined}
              style={{
                width: '100%',
                maxWidth: '500px',
                backgroundColor: 'var(--color-surface-overlay)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xl)',
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
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--color-border-default)',
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
                  style={{ padding: '4px', minHeight: 'auto' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ padding: '20px', overflowY: 'auto', flexGrow: 1, fontSize: '13px' }}>{children}</div>
              
              {footer && (
                <div
                  style={{
                    padding: '12px 20px',
                    borderTop: '1px solid var(--color-border-default)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    backgroundColor: 'var(--color-surface-overlay)',
                    borderBottomLeftRadius: 'var(--radius-lg)',
                    borderBottomRightRadius: 'var(--radius-lg)',
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
