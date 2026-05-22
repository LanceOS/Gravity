import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../utilities/Portal';
import { FocusTrap } from '../utilities/FocusTrap';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Modal({ isOpen, onClose, title, children, footer, style }: ModalProps) {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Portal>
      <FocusTrap>
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(9, 9, 11, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          className="lib-animate-fade-in"
        >
          <ClickAwayListener onClickAway={onClose}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? 'modal-title' : undefined}
              style={{
                width: '100%',
                maxWidth: '500px',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xl)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 'calc(100vh - 32px)',
                ...style,
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {title && (
                  <h2 id="modal-title" style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-heading)' }}>
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
              {/* Content */}
              <div style={{ padding: '20px', overflowY: 'auto', flexGrow: 1, fontSize: '13px' }}>{children}</div>
              {/* Footer */}
              {footer && (
                <div
                  style={{
                    padding: '12px 20px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    backgroundColor: 'var(--sidebar-bg)',
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
