import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { RustFS } from '../src/lib/rustfs.js';
import { MetadataRepository, NotesRepository, NoteRevisionRepository } from '../src/modules/notes/repositories.js';
import { noteBodyRevisions } from '../src/modules/notes/schema.js';
import { createNote, getNote, updateNote, cleanupNoteMedia, recoverAbandonedNoteRevisions } from '../src/modules/notes/services/notes.js';
import { runCleanup } from '../src/jobs/cleanupOrphanedAssets.js';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

const seed = () => createNote('project', 'user', 'Original title', 'original body');
const revisions = () => db.select().from(noteBodyRevisions);

// setup.ts uses pg-mem and an in-memory RustFS mock; no services or containers.
describe('immutable note revisions', () => {
  it('does not expose a newly created note until the body upload succeeds', async () => {
    const entered = gate();
    const release = gate();
    const save = RustFS.saveFile;
    vi.spyOn(RustFS, 'saveFile').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      await save(...args);
    });
    const creating = seed();
    await entered.promise;
    expect(await MetadataRepository.listNotesMetadata('project', 'user')).toEqual([]);
    release.resolve();
    const note = await creating;
    expect(await getNote(note.id, 'project')).toMatchObject({ version: 1, body: 'original body' });
  });

  it.each([false, true])('preserves all committed fields on storage failure (write accepted: %s)', async accepted => {
    const note = await seed();
    const save = RustFS.saveFile;
    vi.spyOn(RustFS, 'saveFile').mockImplementationOnce(async (...args) => {
      if (accepted) await save(...args);
      throw new Error('storage unavailable');
    });
    await expect(updateNote(note.id, 'project', 1, { title: 'changed', body: 'changed' })).rejects.toThrow('storage unavailable');
    expect(await getNote(note.id, 'project')).toEqual(note);
    expect(await RustFS.listFiles(note.bucketPath)).toEqual([note.bodyKey]);
    expect((await revisions()).map(r => r.state).sort()).toEqual(['abandoned', 'committed']);
  });

  it('cleans failed creates without publishing metadata', async () => {
    vi.spyOn(RustFS, 'saveFile').mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(seed()).rejects.toThrow('storage unavailable');
    expect(await MetadataRepository.listNotesMetadata('project', 'user')).toEqual([]);
    expect((await revisions())[0].state).toBe('abandoned');
  });

  it('rejects a delayed stale save after two newer commits, preserving the newest body', async () => {
    const note = await seed();
    const entered = gate();
    const release = gate();
    const save = RustFS.saveFile;
    vi.spyOn(RustFS, 'saveFile').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      await save(...args);
    });
    const slow = updateNote(note.id, 'project', 1, { title: 'slow', body: 'old delayed body' });
    const rejected = expect(slow).rejects.toThrow('CONFLICT');
    await entered.promise;
    expect(await getNote(note.id, 'project')).toEqual(note);
    await updateNote(note.id, 'project', 1, { title: 'second', body: 'second body' });
    await updateNote(note.id, 'project', 2, { title: 'third', body: 'third body' });
    release.resolve();
    await rejected;
    expect(await getNote(note.id, 'project')).toMatchObject({ version: 3, title: 'third', excerpt: 'third body', body: 'third body' });
    expect((await revisions()).filter(r => r.state === 'abandoned')).toHaveLength(1);
  });

  it('lets a reader finish against its captured metadata after a new revision commits', async () => {
    const note = await seed();
    const entered = gate();
    const release = gate();
    const read = NotesRepository.getBody;
    vi.spyOn(NotesRepository, 'getBody').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await release.promise;
      return read(...args);
    });
    const reading = getNote(note.id, 'project');
    await entered.promise;
    await updateNote(note.id, 'project', 1, { body: 'new body' });
    await recoverAbandonedNoteRevisions(false, new Date(Date.now() + 1000));
    release.resolve();
    expect(await reading).toEqual(note);
    expect(await getNote(note.id, 'project')).toMatchObject({ version: 2, body: 'new body' });
  });

  it('preserves the pointer for title-only updates and rejects a stale version before uploading', async () => {
    const note = await seed();
    const save = vi.spyOn(RustFS, 'saveFile');
    expect(await updateNote(note.id, 'project', 1, { title: 'renamed' })).toMatchObject({ version: 2, bodyKey: note.bodyKey, body: note.body });
    await expect(updateNote(note.id, 'project', 1, { body: 'stale' })).rejects.toThrow('CONFLICT');
    expect(save).not.toHaveBeenCalled();
  });

  it('does not delete a committed object if the DB commit acknowledgement is lost', async () => {
    const note = await seed();
    const update = MetadataRepository.updateNoteMetadata.bind(MetadataRepository);
    vi.spyOn(MetadataRepository, 'updateNoteMetadata').mockImplementationOnce(async (...args) => {
      await update(...args);
      throw new Error('lost commit acknowledgement');
    });
    await expect(updateNote(note.id, 'project', 1, { body: 'committed body' })).rejects.toThrow('lost commit acknowledgement');
    await recoverAbandonedNoteRevisions(false, new Date(Date.now() + 1000));
    expect(await getNote(note.id, 'project')).toMatchObject({ version: 2, body: 'committed body' });
    expect((await revisions()).every(r => r.state === 'committed')).toBe(true);
  });

  it('recovers a crashed upload, respects the grace period, and honors dry-run', async () => {
    const old = '.revisions/crashed.md';
    const recent = '.revisions/recent.md';
    await NoteRevisionRepository.stage('orphaned-create', old);
    await NoteRevisionRepository.stage('active-create', recent);
    await db.update(noteBodyRevisions).set({ createdAt: new Date(0) }).where(eq(noteBodyRevisions.bodyKey, old));
    await NotesRepository.saveBody('orphaned-create', 'uncommitted', old);
    await NotesRepository.saveBody('active-create', 'pending', recent);
    expect((await runCleanup(true)).abandonedRevisions).toHaveLength(1);
    expect(await NotesRepository.getBody('orphaned-create', old)).toBe('uncommitted');
    expect((await revisions()).every(r => r.state === 'pending')).toBe(true);
    expect((await runCleanup()).abandonedRevisions).toHaveLength(1);
    await expect(NotesRepository.getBody('orphaned-create', old)).rejects.toThrow('ENOENT');
    expect(await NotesRepository.getBody('active-create', recent)).toBe('pending');
  });

  it('rechecks recovery candidates so a revision committed after the scan remains safe', async () => {
    const note = await seed();
    const key = '.revisions/commit-during-recovery.md';
    await NoteRevisionRepository.stage(note.bucketPath, key);
    await NotesRepository.saveBody(note.bucketPath, 'winner', key);
    const scan = NoteRevisionRepository.recoveryCandidates;
    vi.spyOn(NoteRevisionRepository, 'recoveryCandidates').mockImplementationOnce(async cutoff => {
      const candidates = await scan(cutoff);
      await MetadataRepository.updateNoteMetadata(note.id, 1, { bodyKey: key, excerpt: 'winner' });
      return candidates;
    });
    await recoverAbandonedNoteRevisions(false, new Date(Date.now() + 1000));
    expect(await getNote(note.id, 'project')).toMatchObject({ version: 2, body: 'winner' });
  });

  it('defers failed immediate cleanup and recovers after a metadata failure', async () => {
    const note = await seed();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(MetadataRepository, 'updateNoteMetadata').mockRejectedValueOnce(new Error('DB unavailable'));
    vi.spyOn(NoteRevisionRepository, 'abandon').mockRejectedValueOnce(new Error('DB still unavailable'));
    await expect(updateNote(note.id, 'project', 1, { body: 'uncommitted' })).rejects.toThrow('DB unavailable');
    expect(await getNote(note.id, 'project')).toEqual(note);
    expect(await RustFS.listFiles(note.bucketPath)).toHaveLength(2);
    await recoverAbandonedNoteRevisions(false, new Date(Date.now() + 1000));
    expect(await RustFS.listFiles(note.bucketPath)).toEqual([note.bodyKey]);
  });

  it('fences a timed-out upload and retries cleanup even if that upload finishes after deletion', async () => {
    const note = await seed();
    const entered = gate();
    const release = gate();
    const save = RustFS.saveFile;
    let delayedKey = '';
    vi.spyOn(RustFS, 'saveFile').mockImplementationOnce(async (...args) => {
      delayedKey = args[1];
      entered.resolve();
      await release.promise;
      await save(...args);
    });
    const slow = updateNote(note.id, 'project', 1, { body: 'timed out' });
    const rejected = expect(slow).rejects.toThrow('REVISION_ABANDONED');
    await entered.promise;
    await recoverAbandonedNoteRevisions(false, new Date(Date.now() + 1000));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(NotesRepository, 'deleteFile').mockRejectedValueOnce(new Error('cleanup unavailable'));
    release.resolve();
    await rejected;
    expect(await NotesRepository.getBody(note.bucketPath, delayedKey)).toBe('timed out');
    expect(await getNote(note.id, 'project')).toEqual(note);
    await recoverAbandonedNoteRevisions();
    await expect(NotesRepository.getBody(note.bucketPath, delayedKey)).rejects.toThrow('ENOENT');
    expect(await getNote(note.id, 'project')).toEqual(note);
  });

  it('retains pending and historical body revisions in both media cleanup paths', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const note = await seed();
    await updateNote(note.id, 'project', 1, { body: '![keep](/api/v1/notes/' + note.id + '/media/keep.png)' });
    const pending = '.revisions/pending.md';
    await NoteRevisionRepository.stage(note.bucketPath, pending);
    await NotesRepository.saveBody(note.bucketPath, 'pending', pending);
    await NotesRepository.saveAttachment(note.bucketPath, 'keep.png', 'image');
    await NotesRepository.saveAttachment(note.bucketPath, 'orphan.png', 'image');
    expect((await cleanupNoteMedia(note.id, 'project')).cleanedFiles).toEqual(['orphan.png']);
    expect((await runCleanup()).deleted).toEqual([]);
    expect(await NotesRepository.getBody(note.bucketPath, note.bodyKey)).toBe(note.body);
    expect(await NotesRepository.getBody(note.bucketPath, pending)).toBe('pending');
    expect(await NotesRepository.getAttachment(note.bucketPath, 'keep.png')).toEqual(Buffer.from('image'));
  });

  it('reads legacy body.md and moves to an immutable revision on its next body update', async () => {
    const legacy = await MetadataRepository.createNoteMetadata({ id: 'legacy', projectId: 'project', userId: 'user', title: 'legacy', bucketPath: 'legacy' });
    await NotesRepository.saveBody(legacy.bucketPath, 'legacy body');
    expect(await getNote(legacy.id, 'project')).toMatchObject({ body: 'legacy body', bodyKey: 'body.md' });
    const updated = await updateNote(legacy.id, 'project', 1, { body: 'new body' });
    expect(updated.bodyKey).toMatch(/^\.revisions\//);
    expect(await NotesRepository.getBody(legacy.bucketPath)).toBe('legacy body');
  });

  it('fails closed when a committed revision is missing and protects the revision namespace from attachments', async () => {
    const note = await seed();
    await expect(NotesRepository.saveAttachment(note.bucketPath, note.bodyKey, 'overwrite')).rejects.toThrow('reserved');
    await NotesRepository.deleteFile(note.bucketPath, note.bodyKey);
    await expect(getNote(note.id, 'project')).rejects.toThrow('ENOENT');
    const remove = vi.spyOn(RustFS, 'deleteFile');
    await expect(cleanupNoteMedia(note.id, 'project')).rejects.toMatchObject({
      message: expect.stringContaining(`cannot read or parse body for note ${note.id}`),
      cause: expect.objectContaining({ code: 'ENOENT' }),
    });
    await expect(runCleanup()).rejects.toMatchObject({
      message: expect.stringContaining(`cannot read or parse body for note ${note.id}`),
      cause: expect.objectContaining({ code: 'ENOENT' }),
    });
    expect(remove).not.toHaveBeenCalled();
  });
});
