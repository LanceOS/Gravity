export interface NoteDraft { title: string; body: string; version: number; revision?: string }
// Keep the close warning active even after the editor has been left.
let listening = false;
function protectDrafts() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeunload', (event) => {
    if (!drafts.size) return;
    event.preventDefault();
    event.returnValue = '';
  });
}
const drafts = new Map<string, NoteDraft>();
const listeners = new Map<string, Set<() => void>>();
export function subscribeDraft(key: string | null, listener: () => void) {
  if (!key) return () => {};
  let subscribers = listeners.get(key);
  if (!subscribers) listeners.set(key, subscribers = new Set());
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) listeners.delete(key);
  };
}
export function readDraft(key: string): NoteDraft | null {
  if (drafts.has(key)) return drafts.get(key)!;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (value && typeof value.title === 'string' && typeof value.body === 'string' && typeof value.version === 'number') {
      value.revision = typeof value.revision === 'string' ? value.revision : crypto.randomUUID();
      protectDrafts();
      drafts.set(key, value);
      return value;
    }
  } catch { /* In-memory drafts still work when storage is unavailable. */ }
  return null;
}
export function writeDraft(key: string, draft: NoteDraft | null) {
  protectDrafts();
  if (draft && !draft.revision) draft = { ...draft, revision: crypto.randomUUID() };
  if (draft) drafts.set(key, draft);
  else drafts.delete(key);
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  } catch { /* The unload prompt protects drafts when storage is unavailable. */ }
  listeners.get(key)?.forEach(listener => listener());
}
