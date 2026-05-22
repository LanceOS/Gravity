import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../utilities/Portal';
import { FocusTrap } from '../utilities/FocusTrap';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Drawer({ isOpen, onClose, title, children, style }: DrawerProps) {
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
            backgroundColor: 'rgba(9, 9, 11, 0.5)',
            zIndex: 1500,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          className="lib-animate-fade-in"
        >
          <ClickAwayListener onClickAway={onClose}>
            <div
              role="dialog"
              aria-modal="true"
              style={{
                width: '100%',
                maxWidth: '400px',
                height: '100%',
                backgroundColor: 'var(--card-bg)',
                borderLeft: '1px solid var(--border)',
                boxShadow: 'var(--shadow-xl)',
                display: 'flex',
                flexDirection: 'column',
                ...style,
              }}
              className="lib-animate-slide-in-right"
            >
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
                  <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-heading)' }}>
                    {title}
                  </h2>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close sidebar"
                  className="btn btn-ghost clickable"
                  style={{ padding: '4px', minHeight: 'auto' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ padding: '20px', overflowY: 'auto', flexGrow: 1, fontSize: '13px' }}>{children}</div>
            </div>
          </ClickAwayListener>
        </div>
      </FocusTrap>
    </Portal>
  );
}
