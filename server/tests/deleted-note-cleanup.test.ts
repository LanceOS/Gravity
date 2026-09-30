import { describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/index.js';
import { RustFS } from '../src/lib/rustfs.js';
import { noteBucketCleanups } from '../src/modules/notes/schema.js';
import { MetadataRepository } from '../src/modules/notes/repositories.js';
import { createNote, deleteNote, getNote, updateNote } from '../src/modules/notes/services/notes.js';
import { recoverDeletedNoteBuckets } from '../src/modules/notes/services/deleted-note-cleanup.js';
import { runCleanup } from '../src/jobs/cleanupOrphanedAssets.js';

const seed = () => createNote('project', 'user', 'Title', 'body');
const ledger = () => db.select().from(noteBucketCleanups);
const later = () => new Date(Date.now() + 2 * 86400_000);

async function loseAcknowledgement() {
  const note = await seed();
  const transact = db.transaction.bind(db);
  vi.spyOn(db, 'transaction').mockImplementationOnce(async (...args) => {
    await transact(...args);
    throw new Error('ack lost');
  });
  await expect(deleteNote(note.id, 'project')).rejects.toThrow('ack lost');
  return note;
}

describe('durable deleted note recovery', () => {
  it('recovers a committed deletion interrupted before any cleanup, including a lost acknowledgement', async () => {
    const note = await loseAcknowledgement();
    expect(await getNote(note.id, 'project')).toBeNull();
    expect(await RustFS.readFileUtf8(note.bucketPath, note.bodyKey)).toBe('body');
    expect(await ledger()).toMatchObject([{ status: 'pending', attempts: 0 }]);
    await runCleanup();
    expect(await RustFS.listFiles(note.bucketPath)).toEqual([]);
    expect(await ledger()).toMatchObject([{ status: 'clean', attempts: 1 }]);
  });

  it('never cleans a surviving note after an uncommitted transaction error', async () => {
    const note = await seed();
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('commit failed'));
    await expect(deleteNote(note.id, 'project')).rejects.toThrow('commit failed');
    await recoverDeletedNoteBuckets();
    expect(await ledger()).toEqual([]);
    expect(await getNote(note.id, 'project')).toMatchObject({ body: 'body' });
  });

  it('fails closed even if a stale intent points at a surviving note or reused bucket', async () => {
    const note = await seed();
    await db.insert(noteBucketCleanups).values({ noteId: 'other-id', bucketPath: note.bucketPath });
    const remove = vi.spyOn(RustFS, 'deleteFile');
    expect(await recoverDeletedNoteBuckets()).toMatchObject([{ status: 'blocked', lastError: 'LIVE_NOTE' }]);
    expect(remove).not.toHaveBeenCalled();
    expect(await getNote(note.id, 'project')).toMatchObject({ body: 'body' });
  });

  it('retries partial deletion idempotently and respects backoff', async () => {
    const note = await seed();
    await RustFS.saveFile(note.bucketPath, 'photo.png', 'image');
    const remove = RustFS.deleteFile;
    vi.spyOn(RustFS, 'deleteFile').mockImplementationOnce(async (...args) => {
      await remove(...args);
      throw new Error('secret storage credentials');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await deleteNote(note.id, 'project')).toBe(true);
    expect(await ledger()).toMatchObject([{ status: 'retry', attempts: 1, lastError: 'OBJECT_CLEANUP_FAILED' }]);
    expect(await RustFS.listFiles(note.bucketPath)).toEqual(['photo.png']);
    expect(await recoverDeletedNoteBuckets()).toEqual([]);
    await recoverDeletedNoteBuckets({ now: later() });
    expect(await RustFS.listFiles(note.bucketPath)).toEqual([]);
    expect(await ledger()).toMatchObject([{ status: 'clean', attempts: 2 }]);
  });

  it('bounds prefix work, makes progress, and resweeps late uploads', async () => {
    const note = await loseAcknowledgement();
    for (let i = 0; i < 104; i++) await RustFS.saveFile(note.bucketPath, `file-${i}`, 'image');
    await recoverDeletedNoteBuckets();
    expect((await RustFS.listFiles(note.bucketPath)).length).toBe(5);
    expect(await ledger()).toMatchObject([{ status: 'pending' }]);
    const now = later();
    await recoverDeletedNoteBuckets({ now });
    await RustFS.saveFile(note.bucketPath, 'late.png', 'image');
    await recoverDeletedNoteBuckets({ now: new Date(now.getTime() + 2 * 86400_000) });
    expect(await RustFS.listFiles(note.bucketPath)).toEqual([]);
    await expect(MetadataRepository.createNoteMetadata({ id: note.id, bucketPath: note.bucketPath,
      userId: 'user', projectId: 'project', title: 'Revived' })).rejects.toThrow('NOTE_DELETED');
  });

  it('bounds candidate work and leaves dry runs unchanged', async () => {
    await db.insert(noteBucketCleanups).values(Array.from({ length: 22 }, (_, i) => ({
      noteId: `gone-${i}`, bucketPath: `notes/project/user/${i}`,
    })));
    const list = vi.spyOn(RustFS, 'listDeletedBucketPage');
    expect((await recoverDeletedNoteBuckets({ dryRun: true })).length).toBe(20);
    expect(list).not.toHaveBeenCalled();
    expect((await ledger()).every(row => row.attempts === 0)).toBe(true);
    expect((await recoverDeletedNoteBuckets()).length).toBe(20);
    expect((await recoverDeletedNoteBuckets()).length).toBe(2);
  });

  it('serializes competing recovery workers and skips their stale candidate snapshots', async () => {
    const note = await loseAcknowledgement();
    const list = RustFS.listDeletedBucketPage;
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const releasePromise = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(RustFS, 'listDeletedBucketPage').mockImplementationOnce(async bucket => {
      entered();
      await releasePromise;
      return list(bucket);
    });
    const first = recoverDeletedNoteBuckets();
    await enteredPromise;
    const second = recoverDeletedNoteBuckets();
    release();
    await Promise.all([first, second]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await RustFS.listFiles(note.bucketPath)).toEqual([]);
    expect(await ledger()).toMatchObject([{ attempts: 1, status: 'clean' }]);
  });

  it('blocks a reused note ID even when its surviving metadata has another bucket', async () => {
    const note = await seed();
    const oldBucket = 'notes/project/user/deleted';
    await RustFS.saveFile(oldBucket, 'body.md', 'old body');
    await db.insert(noteBucketCleanups).values({ noteId: note.id, bucketPath: oldBucket });
    expect(await recoverDeletedNoteBuckets()).toMatchObject([{ status: 'blocked', lastError: 'LIVE_NOTE' }]);
    expect(await RustFS.readFileUtf8(oldBucket, 'body.md')).toBe('old body');
    expect(await getNote(note.id, 'project')).toMatchObject({ body: 'body' });
  });

  it('retains retry authorization if cleanup loses its commit acknowledgement', async () => {
    const note = await loseAcknowledgement();
    const transact = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementationOnce(async (...args) => {
      await transact(...args);
      throw new Error('cleanup ack lost');
    });
    await expect(recoverDeletedNoteBuckets()).rejects.toThrow('cleanup ack lost');
    expect(await RustFS.listFiles(note.bucketPath)).toEqual([]);
    await recoverDeletedNoteBuckets({ now: later() });
    expect(await ledger()).toMatchObject([{ status: 'clean', attempts: 2 }]);
  });

  it('fails closed when the recovery transaction cannot start', async () => {
    const note = await loseAcknowledgement();
    const remove = vi.spyOn(RustFS, 'deleteFile');
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('database unavailable'));
    await expect(recoverDeletedNoteBuckets()).rejects.toThrow('database unavailable');
    expect(remove).not.toHaveBeenCalled();
    expect(await RustFS.readFileUtf8(note.bucketPath, note.bodyKey)).toBe('body');
  });


  it.each(['upload', 'metadata-snapshot'])('reports not-found when deletion interrupts an update at %s', async phase => {
    const note = await seed();
    if (phase === 'upload') {
      const save = RustFS.saveFile;
      vi.spyOn(RustFS, 'saveFile').mockImplementationOnce(async (...args) => {
        await deleteNote(note.id, 'project');
        await save(...args);
      });
    } else {
      const get = MetadataRepository.getNoteMetadata;
      vi.spyOn(MetadataRepository, 'getNoteMetadata').mockImplementationOnce(get)
        .mockImplementationOnce(async (...args) => {
          const snapshot = await get(...args);
          await deleteNote(note.id, 'project');
          return snapshot;
        });
    }
    await expect(updateNote(note.id, 'project', 1, { body: 'late body' })).rejects.toThrow('NOT_FOUND');
    expect(await getNote(note.id, 'project')).toBeNull();
    await recoverDeletedNoteBuckets({ now: later() });
    expect(await RustFS.listFiles(note.bucketPath)).toEqual([]);
  });

});
