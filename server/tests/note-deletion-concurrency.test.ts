import { describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/index.js';
import { RustFS } from '../src/lib/rustfs.js';
import { MetadataRepository, NotesRepository } from '../src/modules/notes/repositories.js';
import { createNote, deleteNote, getNote, updateNote } from '../src/modules/notes/services/notes.js';
import { deleteNoteMedia } from '../src/modules/notes/services/media-deletion.js';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

async function fixture() {
  const owner = await createNote('project', 'actor', 'Source', 'Body');
  const other = await createNote('project', 'actor', 'Other', 'Original');
  await RustFS.saveFile(owner.bucketPath, 'photo.png', 'image');
  // Unlike the shared setup's permissive HEAD stub, model absent objects too.
  vi.spyOn(RustFS, 'statFile').mockImplementation(async (bucket, file) => {
    await RustFS.readFile(bucket, file);
    return { etag: 'version', lastModified: new Date(0) };
  });
  const body = `[shared](/api/v1/notes/${owner.id}/media/photo.png)`;
  const publish = (kind: string) => kind === 'create'
    ? createNote('project', 'actor', 'New', body)
    : updateNote(other.id, 'project', 1, { body });
  const remove = (kind: string) => kind === 'media'
    ? deleteNoteMedia(owner.id, 'project', 'photo.png')
    : deleteNote(owner.id, 'project');
  return { owner, other, publish, remove };
}

// These deterministic interleavings use pg-mem's test-only serialization model.
// They verify service boundaries, not PostgreSQL's table-lock implementation.
describe('explicit deletion versus note publication', () => {
  for (const deletion of ['media', 'note']) {
    for (const publication of ['create', 'update']) {
      it(`${deletion} deletion first prevents a queued ${publication} from publishing broken references`, async () => {
        const f = await fixture();
        const deleting = gate();
        const release = gate();
        if (deletion === 'media') {
          const remove = RustFS.deleteFile;
          vi.spyOn(RustFS, 'deleteFile').mockImplementationOnce(async (...args) => {
            deleting.resolve();
            await release.promise;
            await remove(...args);
          });
        } else {
          const remove = MetadataRepository.deleteNoteMetadata;
          vi.spyOn(MetadataRepository, 'deleteNoteMetadata').mockImplementationOnce(async (...args) => {
            deleting.resolve();
            await release.promise;
            await remove(...args);
          });
        }
        const removal = f.remove(deletion);
        await deleting.promise;
        const staged = gate();
        const save = NotesRepository.saveBody;
        vi.spyOn(NotesRepository, 'saveBody').mockImplementationOnce(async (...args) => {
          await save(...args);
          staged.resolve();
        });
        let settled = false;
        const publishing = f.publish(publication).finally(() => { settled = true; });
        const rejected = expect(publishing).rejects.toThrow('Note media references are unavailable');
        await staged.promise;
        expect(settled).toBe(false);
        release.resolve();
        await removal;
        await rejected;
        expect(await getNote(f.other.id, 'project')).toMatchObject({ body: 'Original', version: 1 });
        expect((await MetadataRepository.listNotesForMediaCleanup()).map(n => n.title)).not.toContain('New');
      });

      it(`${publication} publication first makes queued ${deletion} deletion preserve the source`, async () => {
        const f = await fixture();
        const validating = gate();
        const release = gate();
        const stat = RustFS.statFile;
        vi.spyOn(RustFS, 'statFile').mockImplementationOnce(async (...args) => {
          validating.resolve();
          await release.promise;
          return stat(...args);
        });
        const publishing = f.publish(publication);
        await validating.promise;
        const removing = f.remove(deletion);
        const outcome = deletion === 'note'
          ? expect(removing).rejects.toThrow('still referenced')
          : expect(removing).resolves.toMatchObject({ deleted: false, blocked: true });
        release.resolve();
        await publishing;
        await outcome;
        expect(await MetadataRepository.getNoteMetadata(f.owner.id)).not.toBeNull();
        expect(await RustFS.readFileUtf8(f.owner.bucketPath, 'photo.png')).toBe('image');
      });
    }
  }

  it('does not destroy storage when metadata deletion fails', async () => {
    const f = await fixture();
    vi.spyOn(MetadataRepository, 'deleteNoteMetadata').mockRejectedValueOnce(new Error('DB unavailable'));
    const remove = vi.spyOn(NotesRepository, 'deleteBucket');
    await expect(f.remove('note')).rejects.toThrow('DB unavailable');
    expect(remove).not.toHaveBeenCalled();
    expect(await getNote(f.owner.id, 'project')).toMatchObject({ body: 'Body' });
  });

  it('does not destroy storage on an ambiguous metadata commit failure', async () => {
    const f = await fixture();
    const transact = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementationOnce(async (...args) => {
      await transact(...args);
      throw new Error('commit acknowledgement lost');
    });
    const remove = vi.spyOn(NotesRepository, 'deleteBucket');
    await expect(f.remove('note')).rejects.toThrow('commit acknowledgement lost');
    expect(remove).not.toHaveBeenCalled();
    expect(await RustFS.readFileUtf8(f.owner.bucketPath, 'photo.png')).toBe('image');
  });

  it('keeps metadata deleted if object cleanup fails after a partial removal', async () => {
    const f = await fixture();
    const removeFile = RustFS.deleteFile;
    vi.spyOn(RustFS, 'deleteFile').mockImplementationOnce(async (...args) => {
      await removeFile(...args);
      throw new Error('storage unavailable');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await f.remove('note')).toBe(true);
    expect(await getNote(f.owner.id, 'project')).toBeNull();
    expect(log).toHaveBeenCalledWith('Deleted note storage cleanup failed', expect.objectContaining({ noteId: f.owner.id }));
    await expect(f.publish('create')).rejects.toThrow('Note media references are unavailable');
  });

  it('does not report success or retry unconditionally on an object-version conflict', async () => {
    const f = await fixture();
    const remove = vi.spyOn(RustFS, 'deleteFile').mockRejectedValueOnce(new Error('PreconditionFailed'));
    await expect(f.remove('media')).rejects.toThrow('PreconditionFailed');
    expect(remove).toHaveBeenCalledExactlyOnceWith(f.owner.bucketPath, 'photo.png', 'version');
    expect(await RustFS.readFileUtf8(f.owner.bucketPath, 'photo.png')).toBe('image');
  });
});
