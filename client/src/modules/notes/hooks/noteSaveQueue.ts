import type { Note } from '../types';

interface SaveState {
  pending: number;
  error: unknown;
  savedAt: Date | null;
}

// Shared by hook instances so leaving and reopening a note cannot overlap writes.
const queues = new WeakMap<object, Map<string, NoteSaveQueue>>();
export class NoteSaveQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private version: number | undefined;
  private failure: unknown;
  private state: SaveState = { pending: 0, error: null, savedAt: null };
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.state;

  private update(updates: Partial<SaveState>) {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(listener => listener());
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    this.update({ pending: this.state.pending + 1 });
    const run = this.tail.then(operation).finally(() => {
      this.update({ pending: this.state.pending - 1 });
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  save(baseVersion: number, write: (version: number) => Promise<Note>, retry = false): Promise<Note> {
    return this.enqueue(async () => {
      if (this.failure && !retry) throw this.failure;
      try {
        // A deliberate reload can establish a newer baseline. Never rebase a
        // dirty draft on background fetches; callers pass its original version.
        const note = await write(Math.max(this.version ?? baseVersion, baseVersion));
        this.version = note.version;
        this.failure = undefined;
        this.update({ error: null, savedAt: new Date() });
        return note;
      } catch (error) {
        this.failure = error;
        this.update({ error });
        throw error;
      }
    });
  }

  reload(read: () => Promise<Note>): Promise<Note> {
    return this.enqueue(async () => {
      const latest = await read();
      this.failure = undefined;
      this.update({ error: null, savedAt: null });
      // Keep only locally acknowledged versions here: a draft in an editor
      // reopened during this fetch must still conflict with remote changes.
      return latest;
    });
  }
}

export function noteSaveQueue(owner: object, projectId: string, noteId: string) {
  let map = queues.get(owner);
  if (!map) queues.set(owner, map = new Map());
  const key = JSON.stringify([projectId, noteId]);
  let queue = map.get(key);
  if (!queue) map.set(key, queue = new NoteSaveQueue());
  return queue;
}
