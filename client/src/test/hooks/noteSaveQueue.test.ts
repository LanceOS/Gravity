import { describe, expect, it, vi } from 'vitest';
import { NoteSaveQueue, noteSaveQueue } from '../../modules/notes/hooks/noteSaveQueue';
import type { Note } from '../../modules/notes/types';

const note = (version: number) => ({ version } as Note);
describe('note save queue', () => {
  it('serializes overlapping saves and uses the last acknowledged version', async () => {
    const queue = new NoteSaveQueue();
    let finish!: (note: Note) => void;
    const first = vi.fn(() => new Promise<Note>(resolve => { finish = resolve; }));
    const second = vi.fn(async () => note(3));
    const a = queue.save(1, first);
    const b = queue.save(1, second);
    await Promise.resolve();
    expect(first).toHaveBeenCalledWith(1);
    expect(second).not.toHaveBeenCalled();
    finish(note(2));
    await Promise.all([a, b]);
    expect(second).toHaveBeenCalledWith(2);
  });

  it('stops queued saves after conflict, propagates failure, and supports explicit retry/reload', async () => {
    const queue = new NoteSaveQueue();
    const conflict = new Error('409');
    const a = queue.save(1, async () => { throw conflict; });
    const write = vi.fn(async () => note(2));
    const b = queue.save(1, write);
    await expect(a).rejects.toBe(conflict);
    await expect(b).rejects.toBe(conflict);
    expect(write).not.toHaveBeenCalled();
    await queue.save(1, write, true);
    expect(write).toHaveBeenCalledWith(1);
    await queue.reload(async () => note(5));
    await queue.save(5, write);
    expect(write).toHaveBeenLastCalledWith(5);
  });

  it('shares queues across remounts but isolates projects, notes, and query clients', () => {
    const owner = {};
    expect(noteSaveQueue(owner, 'p', 'a')).toBe(noteSaveQueue(owner, 'p', 'a'));
    expect(noteSaveQueue(owner, 'p', 'a')).not.toBe(noteSaveQueue(owner, 'p', 'b'));
    expect(noteSaveQueue(owner, 'p', 'a')).not.toBe(noteSaveQueue(owner, 'q', 'a'));
    expect(noteSaveQueue(owner, 'p', 'a')).not.toBe(noteSaveQueue({}, 'p', 'a'));
  });
});
