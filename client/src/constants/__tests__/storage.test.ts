import { describe, expect, it } from 'vitest';
import { getNoteDraftStorageKey, NOTE_DRAFT_STORAGE_PREFIX } from '../storage';

describe('note draft storage keys', () => {
  it('preserves the persisted prefix and scopes each key to its user, project, and note', () => {
    const key = getNoteDraftStorageKey('user-1', 'project-1', 'note-1');

    expect(key).toBe(`${NOTE_DRAFT_STORAGE_PREFIX}${JSON.stringify(['user-1', 'project-1', 'note-1'])}`);
    expect(getNoteDraftStorageKey('user-2', 'project-1', 'note-1')).not.toBe(key);
    expect(getNoteDraftStorageKey('user-1', 'project-2', 'note-1')).not.toBe(key);
    expect(getNoteDraftStorageKey('user-1', 'project-1', 'note-2')).not.toBe(key);
  });
});
