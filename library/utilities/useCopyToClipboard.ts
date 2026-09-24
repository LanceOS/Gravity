import { useCallback, useEffect, useRef, useState } from 'react';

export interface CopyToClipboardOptions {
  resetAfterMs?: number;
  /** Persist only feedback metadata across remounts, never the copied text. */
  storageKey?: string;
}

type CopyFeedback = {
  status: 'idle' | 'copied' | 'error';
  key: string | null;
  expiresAt: number;
};
const idleFeedback: CopyFeedback = { status: 'idle', key: null, expiresAt: 0 };

function saveFeedback(storageKey: string | undefined, feedback: CopyFeedback) {
  if (!storageKey) return;
  try {
    if (feedback.status === 'copied') {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ key: feedback.key, expiresAt: feedback.expiresAt }));
    } else {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Storage is optional in restricted/private environments.
  }
}

function readFeedback(storageKey: string | undefined): CopyFeedback {
  if (!storageKey) return idleFeedback;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null');
    if (typeof saved?.key === 'string' && typeof saved?.expiresAt === 'number' && saved.expiresAt > Date.now()) {
      return { status: 'copied', key: saved.key, expiresAt: saved.expiresAt };
    }
  } catch {
    // Missing or malformed storage must not prevent copying.
  }
  saveFeedback(storageKey, idleFeedback);
  return idleFeedback;
}

async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission/security restrictions can still allow the legacy copy path.
    }
  }
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    throw new Error('Clipboard is unavailable');
  }

  const previousFocus = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    if (!document.execCommand('copy')) throw new Error('Copy failed');
  } finally {
    textarea.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach(range => selection.addRange(range));
    }
  }
}

/** Shared copy behavior with expiring feedback and protection against stale async results. */
export function useCopyToClipboard({ resetAfterMs = 2000, storageKey }: CopyToClipboardOptions = {}) {
  const [feedback, setFeedback] = useState<CopyFeedback>(() => readFeedback(storageKey));
  const requestId = useRef(0);

  useEffect(() => () => { requestId.current++; }, []);

  useEffect(() => {
    if (feedback.status === 'idle') return;
    const timeout = setTimeout(() => {
      setFeedback(idleFeedback);
      saveFeedback(storageKey, idleFeedback);
    }, Math.max(0, feedback.expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [feedback, storageKey]);

  const reset = useCallback(() => {
    requestId.current++;
    setFeedback(idleFeedback);
    saveFeedback(storageKey, idleFeedback);
  }, [storageKey]);

  const copy = useCallback(async (text: string, key = 'default'): Promise<boolean> => {
    const currentRequest = ++requestId.current;
    setFeedback(idleFeedback);
    saveFeedback(storageKey, idleFeedback);
    let success = false;
    try {
      await writeClipboard(text);
      success = true;
    } catch {
      // Consumers render the shared error state or use the returned result for a toast.
    }
    // Feedback belongs to the latest request, but callers still need the actual
    // result of their own copy (for example, to start work on a ticket).
    if (currentRequest !== requestId.current) return success;
    const next: CopyFeedback = { status: success ? 'copied' : 'error', key, expiresAt: Date.now() + resetAfterMs };
    setFeedback(next);
    saveFeedback(storageKey, next);
    return success;
  }, [resetAfterMs, storageKey]);

  return {
    copy,
    reset,
    status: feedback.status,
    copied: feedback.status === 'copied',
    error: feedback.status === 'error',
    copiedKey: feedback.status === 'copied' ? feedback.key : null,
  };
}
