import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/index.js';
import { runCleanup } from '../src/jobs/cleanupOrphanedAssets.js';
import { RustFS } from '../src/lib/rustfs.js';
import { MetadataRepository, NotesRepository } from '../src/modules/notes/repositories.js';
import { withNoteReferenceLock } from '../src/modules/notes/reference-lock.js';
import { noteMediaDeletions } from '../src/modules/notes/schema.js';
import { createMediaDeletionClaim, deleteClaimedMedia, recoverMediaDeletionClaims } from '../src/modules/notes/services/media-claims.js';
import { cleanupMedia } from '../src/modules/notes/services/media-cleanup.js';
import { deleteNoteMedia, uploadNoteMedia } from '../src/modules/notes/services/media-deletion.js';
import { createNote, getNote, updateNote } from '../src/modules/notes/services/notes.js';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

async function fixture() {
  const owner = await createNote('project', 'actor', 'Owner', 'Original');
  const other = await createNote('project', 'actor', 'Other', 'Original');
  await RustFS.saveFile(owner.bucketPath, 'photo.png', 'image');
  vi.spyOn(RustFS, 'statFile').mockImplementation(async (bucket, file) => {
    await RustFS.readFile(bucket, file);
    return { etag: 'version', lastModified: new Date(0) };
  });
  const body = `![image](/api/v1/notes/${owner.id}/media/photo.png)`;
  const deps = {
    listNotes: MetadataRepository.listNotesForMediaCleanup,
    getBody: NotesRepository.getBody,
    listFiles: (bucket: string) => RustFS.listFiles(bucket),
    statFile: (bucket: string, file: string) => RustFS.statFile(bucket, file),
    deleteFile: (bucket: string, file: string, etag: string) => RustFS.deleteFile(bucket, file, etag),
  };
  return { owner, other, body, deps };
}

describe('durable note media deletion claims', () => {
  it('fences a save queued behind orphan deletion, including after the final scan', async () => {
    const f = await fixture();
    const deleting = gate();
    const release = gate();
    const original = RustFS.deleteFile;
    vi.spyOn(RustFS, 'deleteFile').mockImplementationOnce(async (...args) => {
      deleting.resolve();
      await release.promise;
      await original(...args);
    });
    const cleanup = cleanupMedia(f.deps, {}, f.owner);
    await deleting.promise;
    const pending = updateNote(f.other.id, 'project', 1, { body: f.body });
    const rejection = expect(pending).rejects.toThrow('Note media references are unavailable');
    release.resolve();
    await cleanup;
    await rejection;
    expect(await getNote(f.other.id, 'project')).toMatchObject({ body: 'Original', version: 1 });
    expect(await RustFS.listFiles(f.owner.bucketPath)).not.toContain('photo.png');
  });

  it('lets a save reject the durable claim while orphan DELETE is still in flight', async () => {
    const f = await fixture();
    const deleting = gate();
    const release = gate();
    const original = RustFS.deleteFile;
    vi.spyOn(RustFS, 'deleteFile').mockImplementationOnce(async (...args) => {
      deleting.resolve();
      await release.promise;
      await original(...args);
    });
    const cleanup = cleanupMedia(f.deps, {}, f.owner);
    await deleting.promise;
    // This settles before releasing storage because the claim, rather than a
    // long-held table lock, prevents publication.
    await expect(updateNote(f.other.id, 'project', 1, { body: f.body }))
      .rejects.toThrow('Note media references are unavailable');
    release.resolve();
    await cleanup;
  });

  it('preserves media when publication commits before the locked cleanup decision', async () => {
    const f = await fixture();
    const scanned = gate();
    const release = gate();
    let lists = 0;
    const cleanup = cleanupMedia({ ...f.deps, listNotes: async () => {
      const notes = await MetadataRepository.listNotesForMediaCleanup();
      if (++lists === 2) { scanned.resolve(); await release.promise; }
      return notes;
    } }, {}, f.owner);
    await scanned.promise;
    await updateNote(f.other.id, 'project', 1, { body: f.body });
    release.resolve();
    const result = await cleanup;
    expect(result.deleted).toEqual([]);
    expect(result.deferred).toMatchObject([{ file: 'photo.png' }]);
    expect(await RustFS.readFileUtf8(f.owner.bucketPath, 'photo.png')).toBe('image');
  });

  it('restarts grace for an identical re-upload before the final claim', async () => {
    const f = await fixture();
    const scanned = gate();
    const release = gate();
    let lists = 0;
    let uploaded = false;
    vi.spyOn(RustFS, 'statFile').mockImplementation(async (bucket, file) => {
      await RustFS.readFile(bucket, file);
      return { etag: 'version', lastModified: uploaded ? new Date() : new Date(0) };
    });
    const cleanup = cleanupMedia({ ...f.deps, listNotes: async () => {
      const notes = await MetadataRepository.listNotesForMediaCleanup();
      if (++lists === 2) { scanned.resolve(); await release.promise; }
      return notes;
    } }, {}, f.owner);
    await scanned.promise;
    await uploadNoteMedia(f.owner.id, 'project', 'photo.png', Readable.from([Buffer.from('image')]));
    uploaded = true;
    release.resolve();
    const result = await cleanup;
    expect(result.deleted).toEqual([]);
    expect(result.deferred).toMatchObject([{ file: 'photo.png' }]);
    expect(await RustFS.readFileUtf8(f.owner.bucketPath, 'photo.png')).toBe('image');
  });

  it('retains a claim after a timed-out DELETE and rejects publication and same-name upload', async () => {
    const f = await fixture();
    const delayed = gate();
    const original = RustFS.deleteFile;
    vi.spyOn(RustFS, 'deleteFile').mockImplementationOnce(async (...args) => {
      void delayed.promise.then(() => original(...args));
      throw new Error('DELETE acknowledgement lost');
    });
    await expect(cleanupMedia(f.deps, {}, f.owner)).rejects.toThrow('DELETE acknowledgement lost');
    expect(await RustFS.readFileUtf8(f.owner.bucketPath, 'photo.png')).toBe('image');
    await expect(createNote('project', 'actor', 'Broken', f.body)).rejects.toThrow('Note media references are unavailable');
    await expect(uploadNoteMedia(f.owner.id, 'project', 'photo.png', Readable.from([Buffer.from('replacement')]))).rejects.toThrow('reserved by a media deletion');
    const claim = (await db.select().from(noteMediaDeletions))[0];
    expect(claim.status).toBe('ambiguous');
    expect(await recoverMediaDeletionClaims({ now: new Date(Date.now() + 120_000) })).toHaveLength(1);
    expect((await db.select().from(noteMediaDeletions))[0].status).toBe('ambiguous');
    delayed.resolve();
    await new Promise(resolve => setImmediate(resolve));
    await expect(uploadNoteMedia(f.owner.id, 'project', 'photo.png', Readable.from([Buffer.from('replacement')]))).rejects.toThrow('reserved by a media deletion');
  });

  it('recovers a committed claim left by process loss before DELETE', async () => {
    const f = await fixture();
    await withNoteReferenceLock(async tx => {
      await createMediaDeletionClaim(f.owner.id, f.owner.bucketPath, 'photo.png', 'version', tx);
    });
    await expect(createNote('project', 'actor', 'Broken', f.body)).rejects.toThrow('Note media references are unavailable');
    const recovered = await recoverMediaDeletionClaims({ now: new Date(Date.now() + 120_000) });
    expect(recovered).toHaveLength(1);
    expect(recovered[0].status).toBe('ambiguous');
    expect(await RustFS.listFiles(f.owner.bucketPath)).not.toContain('photo.png');
  });

  it('retains a changed object and backs off its ambiguous claim', async () => {
    const f = await fixture();
    await withNoteReferenceLock(tx =>
      createMediaDeletionClaim(f.owner.id, f.owner.bucketPath, 'photo.png', 'version', tx));
    vi.spyOn(RustFS, 'statFile').mockResolvedValue({ etag: 'new-version', lastModified: new Date() });
    const remove = vi.spyOn(RustFS, 'deleteFile');
    const now = new Date(Date.now() + 120_000);
    const [claim] = await recoverMediaDeletionClaims({ now });
    expect(claim.lastError).toBe('OBJECT_VERSION_CHANGED');
    expect(claim.nextAttemptAt.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the fence when a DELETE promise never settles', async () => {
    const f = await fixture();
    const claimId = await withNoteReferenceLock(tx =>
      createMediaDeletionClaim(f.owner.id, f.owner.bucketPath, 'photo.png', 'version', tx));
    expect(claimId).not.toBeNull();
    await expect(deleteClaimedMedia(
      f.owner.bucketPath, 'photo.png', claimId!, () => new Promise(() => {}),
      { requestTimeoutMs: 10 },
    )).rejects.toThrow('Media deletion storage request timed out');
    expect((await db.select().from(noteMediaDeletions))[0].status).toBe('ambiguous');
    await expect(createNote('project', 'actor', 'Broken', f.body)).rejects.toThrow('Note media references are unavailable');
  });

  it('does not confirm an old DELETE that finishes after recovery retried it', async () => {
    const f = await fixture();
    const deleting = gate();
    const release = gate();
    const original = RustFS.deleteFile;
    vi.spyOn(RustFS, 'deleteFile').mockImplementationOnce(async (...args) => {
      deleting.resolve();
      await release.promise;
      await original(...args);
    });
    const cleanup = cleanupMedia(f.deps, {}, f.owner);
    await deleting.promise;
    const recovered = await recoverMediaDeletionClaims({ now: new Date(Date.now() + 120_000) });
    expect(recovered[0].status).toBe('ambiguous');
    release.resolve();
    expect((await cleanup).deferred).toMatchObject([{ file: 'photo.png' }]);
    expect((await db.select().from(noteMediaDeletions))[0].status).toBe('ambiguous');
    await expect(uploadNoteMedia(f.owner.id, 'project', 'photo.png', Readable.from([Buffer.from('replacement')]))).rejects.toThrow('reserved by a media deletion');
  });

  it('recovers an older claim even when a malformed note aborts the new scan', async () => {
    const f = await fixture();
    await withNoteReferenceLock(async tx => {
      await createMediaDeletionClaim(f.owner.id, f.owner.bucketPath, 'photo.png', 'version', tx);
    });
    await db.update(noteMediaDeletions).set({ nextAttemptAt: new Date(0) });
    vi.spyOn(NotesRepository, 'getBody').mockRejectedValue(new Error('unreadable body'));
    await expect(runCleanup()).rejects.toThrow('cannot read or parse body');
    expect((await db.select().from(noteMediaDeletions))[0].attempts).toBe(1);
    expect(await RustFS.listFiles(f.owner.bucketPath)).not.toContain('photo.png');
  });

  it('also fences publication after an ambiguous explicit media deletion', async () => {
    const f = await fixture();
    vi.spyOn(RustFS, 'deleteFile').mockRejectedValueOnce(new Error('DELETE acknowledgement lost'));
    await expect(deleteNoteMedia(f.owner.id, 'project', 'photo.png')).rejects.toThrow('DELETE acknowledgement lost');
    expect((await db.select().from(noteMediaDeletions))[0].status).toBe('ambiguous');
    await expect(updateNote(f.other.id, 'project', 1, { body: f.body })).rejects.toThrow('Note media references are unavailable');
  });

  it('allows reuse after a confirmed DELETE and clears the claim only after upload completes', async () => {
    const f = await fixture();
    await cleanupMedia(f.deps, {}, f.owner);
    expect((await db.select().from(noteMediaDeletions))[0].status).toBe('confirmed');
    expect(await uploadNoteMedia(f.owner.id, 'project', 'photo.png', Readable.from([Buffer.from('replacement')]))).toBe(true);
    expect(await db.select().from(noteMediaDeletions)).toEqual([]);
    await createNote('project', 'actor', 'New', f.body);
    expect(await RustFS.readFileUtf8(f.owner.bucketPath, 'photo.png')).toBe('replacement');
  });

  it('reclaims a confirmed filename if an older PUT appears after cleanup', async () => {
    const f = await fixture();
    await cleanupMedia(f.deps, {}, f.owner);
    await RustFS.saveFile(f.owner.bucketPath, 'photo.png', 'late upload');
    const result = await cleanupMedia(f.deps, {}, f.owner);
    expect(result.deleted).toMatchObject([{ file: 'photo.png' }]);
    expect(await RustFS.listFiles(f.owner.bucketPath)).not.toContain('photo.png');
  });
});
