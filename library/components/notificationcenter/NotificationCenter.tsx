import React from 'react';
import { X } from 'lucide-react';
import { Portal } from '../../utilities';

export interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
}

type ToastListener = (toasts: ToastItem[]) => void;

let toastListeners: ToastListener[] = [];
let toastsGlobalStack: ToastItem[] = [];

function emitToasts() {
  toastListeners.forEach((listener) => listener(toastsGlobalStack));
}

function dismissToast(id: string) {
  toastsGlobalStack = toastsGlobalStack.filter((item) => item.id !== id);
  emitToasts();
}

export const toast = {
  show(message: string, type: ToastItem['type'] = 'info', duration = 4000) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextToast: ToastItem = { id, message, type };

    toastsGlobalStack = [...toastsGlobalStack, nextToast];
    emitToasts();

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }

    return id;
  },
  dismiss(id: string) {
    dismissToast(id);
  },
  clear() {
    toastsGlobalStack = [];
    emitToasts();
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
            success: 'var(--color-base400)',
            error: 'var(--color-text-primary)',
            warning: 'var(--color-text-secondary)',
            info: 'var(--color-text-primary)',
          };
          return (
            <div
              key={t.id}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-default)',
                borderLeft: `4px solid ${typeColors[t.type || 'info']}`,
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
              }}
              className="lib-animate-fade-in"
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => {
                  dismissToast(t.id);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-disabled)' }}
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
