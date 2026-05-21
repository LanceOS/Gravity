import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../utilities/Portal';
import { FocusTrap } from '../utilities/FocusTrap';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

// Helper to join class names
function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

// 1. Modal
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

// 2. Drawer
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

// 3. Toast, Message (State management and rendering)
export interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
}

// Simple Toast Singleton Context or Global Stack
let toastListeners: Array<(toasts: ToastItem[]) => void> = [];
let toastsGlobalStack: ToastItem[] = [];

export const toast = {
  show: (message: string, type: ToastItem['type'] = 'info') => {
    const id = Math.random().toString();
    const newToast: ToastItem = { id, message, type };
    toastsGlobalStack = [...toastsGlobalStack, newToast];
    toastListeners.forEach((listener) => listener(toastsGlobalStack));

    setTimeout(() => {
      toastsGlobalStack = toastsGlobalStack.filter((t) => t.id !== id);
      toastListeners.forEach((listener) => listener(toastsGlobalStack));
    }, 4000);
  },
};

export function NotificationCenter() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    const listener = (newToasts: ToastItem[]) => setToasts(newToasts);
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <Portal>
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '320px',
        }}
      >
        {toasts.map((t) => {
          const typeColors = {
            success: 'var(--priority-low)',
            error: 'var(--priority-high)',
            warning: 'var(--priority-medium)',
            info: 'var(--text-heading)',
          };
          return (
            <div
              key={t.id}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${typeColors[t.type || 'info']}`,
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '13px',
                color: 'var(--text-heading)',
              }}
              className="lib-animate-fade-in"
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => {
                  toastsGlobalStack = toastsGlobalStack.filter((item) => item.id !== t.id);
                  toastListeners.forEach((listener) => listener(toastsGlobalStack));
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </Portal>
  );
}

// 4. Alert
export interface AlertProps {
  type?: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export function Alert({ type = 'info', title, children, style }: AlertProps) {
  const typeIcons = {
    success: <CheckCircle2 size={16} style={{ color: 'var(--priority-low)' }} />,
    error: <AlertCircle size={16} style={{ color: 'var(--priority-high)' }} />,
    warning: <AlertTriangle size={16} style={{ color: 'var(--priority-medium)' }} />,
    info: <Info size={16} style={{ color: 'var(--accent)' }} />,
  };

  const bgColors = {
    success: 'rgba(59, 130, 246, 0.05)',
    error: 'rgba(239, 68, 68, 0.05)',
    warning: 'rgba(245, 158, 11, 0.05)',
    info: 'var(--accent-glow)',
  };

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: bgColors[type],
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        fontSize: '13px',
        ...style,
      }}
    >
      <div style={{ marginTop: '2px' }}>{typeIcons[type]}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {title && <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{title}</span>}
        <div style={{ color: 'var(--text)' }}>{children}</div>
      </div>
    </div>
  );
}

// 5. Popconfirm
export interface PopconfirmProps {
  title: string;
  onConfirm: () => void;
  children: React.ReactElement;
  style?: React.CSSProperties;
}
export function Popconfirm({ title, onConfirm, children, style }: PopconfirmProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {React.cloneElement(children as React.ReactElement<any>, {
          onClick: (e: React.MouseEvent) => {
            e.preventDefault();
            setIsOpen(!isOpen);
            (children.props as any).onClick?.(e);
          },
        })}
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: '10px 12px',
              zIndex: 1000,
              minWidth: '160px',
              marginBottom: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              ...style,
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-heading)', fontWeight: 500 }}>{title}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn btn-sm clickable"
                style={{ padding: '2px 6px', minHeight: 'auto', fontSize: '11px' }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  setIsOpen(false);
                }}
                className="btn btn-sm btn-primary clickable"
                style={{ padding: '2px 6px', minHeight: 'auto', fontSize: '11px' }}
              >
                Yes
              </button>
            </div>
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}

// 6. Tooltip
export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export function Tooltip({ content, children, style }: TooltipProps) {
  const [show, setShow] = React.useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <Portal>
          <div
            role="tooltip"
            style={{
              position: 'absolute',
              backgroundColor: 'var(--text-heading)',
              color: 'var(--bg)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              zIndex: 9999,
              boxShadow: 'var(--shadow-sm)',
              pointerEvents: 'none',
              ...style,
            }}
            className="lib-animate-fade-in"
          >
            {content}
          </div>
        </Portal>
      )}
    </div>
  );
}

// 7. EmptyState
export interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}
export function EmptyState({ title, description, action, style }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        textAlign: 'center',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--card-bg)',
        ...style,
      }}
    >
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px 0' }}>{title}</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '320px', margin: '0 0 16px 0' }}>
        {description}
      </p>
      {action}
    </div>
  );
}

// 8. Result
export interface ResultProps {
  status: 'success' | 'error' | 'info';
  title: string;
  subTitle?: string;
  extra?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Result({ status, title, subTitle, extra, style }: ResultProps) {
  const statusIcons = {
    success: <CheckCircle2 size={40} style={{ color: 'var(--priority-low)', marginBottom: '12px' }} />,
    error: <AlertCircle size={40} style={{ color: 'var(--priority-high)', marginBottom: '12px' }} />,
    info: <Info size={40} style={{ color: 'var(--accent)', marginBottom: '12px' }} />,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        ...style,
      }}
    >
      {statusIcons[status]}
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 6px 0' }}>{title}</h2>
      {subTitle && <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px 0' }}>{subTitle}</p>}
      {extra}
    </div>
  );
}

// 9. ProgressBar
export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  style?: React.CSSProperties;
}
export function ProgressBar({ value, max = 100, label, style }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', ...style }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span>{label}</span>
          <span>{Math.round(percent)}%</span>
        </div>
      )}
      <progress
        value={value}
        max={max}
        style={{
          width: '100%',
          height: '6px',
          appearance: 'none',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          backgroundColor: 'var(--border)',
          border: 'none',
        }}
      />
    </div>
  );
}

// 10. CircularSpinner
export interface CircularSpinnerProps {
  size?: number;
  style?: React.CSSProperties;
}
export function CircularSpinner({ size = 20, style }: CircularSpinnerProps) {
  return (
    <svg
      className="lib-spinner"
      viewBox="0 0 50 50"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        ...style,
      }}
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="var(--accent-solid)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="80px, 200px"
      />
    </svg>
  );
}

// 11. Skeleton
export interface SkeletonProps {
  variant?: 'circle' | 'text' | 'rect';
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}
export function Skeleton({ variant = 'rect', width = '100%', height = '16px', style }: SkeletonProps) {
  const radiusMap = {
    circle: '50%',
    text: 'var(--radius-xs)',
    rect: 'var(--radius-md)',
  };

  return (
    <div
      className="lib-skeleton-pulse"
      aria-busy="true"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: radiusMap[variant],
        backgroundColor: 'var(--border)',
        ...style,
      }}
    />
  );
}

// 12. Popover
export interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  style?: React.CSSProperties;
}

export function Popover({ trigger, children, isOpen: controlledIsOpen, onOpenChange, style }: PopoverProps) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = React.useState(false);
  const isCurrentlyOpen = controlledIsOpen !== undefined ? controlledIsOpen : uncontrolledIsOpen;

  const setOpen = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setUncontrolledIsOpen(open);
    }
  };

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <div style={{ position: 'relative', display: 'inline-block', ...style }}>
        <div
          onClick={() => setOpen(!isCurrentlyOpen)}
          className="clickable"
          style={{ display: 'contents' }}
        >
          {trigger}
        </div>
        {isCurrentlyOpen && (
          <div
            role="dialog"
            className="lib-animate-fade-in"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: 'var(--space-3)',
              minWidth: '200px',
              marginTop: '8px',
            }}
          >
            {children}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}

