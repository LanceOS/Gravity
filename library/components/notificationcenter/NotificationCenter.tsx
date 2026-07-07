import React from 'react';
import { X } from 'lucide-react';
import { Portal, runAnime } from '../../utilities';
import anime from 'animejs';

export type ToastType = 'error' | 'warning' | 'info' | 'success';

export interface ToastPayload {
  type: ToastType;
  message: string;
}

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const TOAST_IN_DURATION = 160;
const TOAST_OUT_DURATION = 130;
const TOAST_EASING = 'cubic-bezier(0.2, 0, 0.38, 1)';

function shouldReduceMotion(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type ToastListener = (toasts: ToastItem[]) => void;

let toastListeners: ToastListener[] = [];
let toastsGlobalStack: ToastItem[] = [];
const DEFAULT_TOAST_DURATION = 4000;

function emitToasts() {
  toastListeners.forEach((listener) => listener(toastsGlobalStack));
}

function dismissToast(id: string) {
  toastsGlobalStack = toastsGlobalStack.filter((item) => item.id !== id);
  emitToasts();
}

function pushToast(type: ToastType, message: string, duration = DEFAULT_TOAST_DURATION) {
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
}

interface ToastApi {
  (input: ToastPayload): string;
  show(message: string, type?: ToastType, duration?: number): string;
  dismiss(id: string): void;
  clear(): void;
}

export const toast: ToastApi = ((input: ToastPayload): string => {
  return pushToast(input.type, input.message);
}) as ToastApi;

toast.show = (message: string, type: ToastType = 'info', duration = DEFAULT_TOAST_DURATION) => {
  return pushToast(type, message, duration);
};

toast.dismiss = (id: string) => {
  dismissToast(id);
};

toast.clear = () => {
  toastsGlobalStack = [];
  emitToasts();
};

interface ToastItemComponentProps {
  item: ToastItem & { isExiting?: boolean };
  onExited: (id: string) => void;
}

function ToastItemComponent({ item, onExited }: ToastItemComponentProps) {
  const elementRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (!item.isExiting && elementRef.current) {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        return;
      }
      if (shouldReduceMotion()) {
        return;
      }
      elementRef.current.style.opacity = '0';
      elementRef.current.style.transform = 'translateY(10px)';
      runAnime({
        targets: elementRef.current,
        opacity: [0, 1],
        translateY: [10, 0],
        duration: TOAST_IN_DURATION,
        easing: TOAST_EASING,
      });
    }
  }, [item.isExiting]);

  React.useEffect(() => {
    if (item.isExiting && elementRef.current) {
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        onExited(item.id);
        return;
      }
      if (shouldReduceMotion()) {
        onExited(item.id);
        return;
      }
      runAnime({
        targets: elementRef.current,
        opacity: [1, 0],
        translateX: [0, 24],
        duration: TOAST_OUT_DURATION,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        complete: () => {
          onExited(item.id);
        },
      });
    }
  }, [item.isExiting, item.id, onExited]);

  React.useEffect(() => {
    return () => {
      if (elementRef.current) {
        anime.remove(elementRef.current);
      }
    };
  }, []);

  const typeColors = {
    success: 'var(--color-base400)',
    error: 'var(--color-text-primary)',
    warning: 'var(--color-text-secondary)',
    info: 'var(--color-text-primary)',
  };

  return (
    <div
      ref={elementRef}
      style={{
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-surface-card)',
        border: '1px solid var(--color-border-default)',
        borderLeft: `4px solid ${typeColors[item.type]}`,
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        fontSize: '13px',
        color: 'var(--color-text-primary)',
      }}
    >
      <span>{item.message}</span>
      <button
        type="button"
        onClick={() => {
          dismissToast(item.id);
        }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-disabled)' }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Toast() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const [localToasts, setLocalToasts] = React.useState<(ToastItem & { isExiting?: boolean })[]>([]);

  React.useEffect(() => {
    const listener = (newToasts: ToastItem[]) => setToasts(newToasts);
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  React.useEffect(() => {
    setLocalToasts((prevLocal) => {
      const nextLocal = [...prevLocal];
      
      // Add new ones
      toasts.forEach((t) => {
        if (!nextLocal.some((local) => local.id === t.id)) {
          nextLocal.push(t);
        }
      });

      // Mark removed ones as exiting
      return nextLocal.map((local) => {
        if (!toasts.some((t) => t.id === local.id)) {
          return { ...local, isExiting: true };
        }
        return local;
      });
    });
  }, [toasts]);

  const handleExited = React.useCallback((id: string) => {
    setLocalToasts((prev) => prev.filter((t) => t.id !== id));
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
        {localToasts.map((t) => (
          <ToastItemComponent key={t.id} item={t} onExited={handleExited} />
        ))}
      </div>
    </Portal>
  );
}

export const NotificationCenter = Toast;
