import React from 'react';
import { X, AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Portal } from '../../utilities';
import { FocusTrap } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
}

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
