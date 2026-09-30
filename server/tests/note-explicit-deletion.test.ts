import { describe, expect, it, vi } from 'vitest';
import { RustFS } from '../src/lib/rustfs.js';
import { MetadataRepository, NotesRepository } from '../src/modules/notes/repositories.js';
import { createNote, deleteNote } from '../src/modules/notes/services/notes.js';
import { deleteNoteMedia } from '../src/modules/notes/services/media-deletion.js';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

async function fixture() {
  const actor = await createAuthenticatedApi({ name: 'Deletion owner', email: 'delete@example.com', role: 'owner' });
  const { project } = await seedWorkspaceFixture({ owner: {
    id: actor.user.id, name: actor.user.name, email: actor.user.email, role: 'owner', avatarUrl: actor.user.avatar,
  } });
  const note = await createNote(project.id, actor.user.id, 'Source', 'No references');
  await RustFS.saveFile(note.bucketPath, 'photo.png', 'image');
  const mediaPath = `/api/v1/notes/${note.id}/media/photo.png`;
  const removeMedia = () => actor.delete(mediaPath).set('x-project-id', project.id);
  const removeNote = () => actor.delete(`/api/v1/notes/${note.id}`).set('x-project-id', project.id);
  return { actor, project, note, mediaPath, removeMedia, removeNote };
}

describe('explicit reference-aware deletion', () => {
  it.each(['markdown', 'richtext'])('preserves shared attachments and source metadata (%s)', async format => {
    const f = await fixture();
    const body = format === 'markdown' ? `![shared](${f.mediaPath})` : JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { src: f.mediaPath } }] });
    const ref = await createNote(f.project.id, f.actor.user.id, 'Reference', body);
    expect((await f.removeMedia()).body).toEqual({ deleted: false, blocked: true, remainingReferences: [{ noteId: ref.id }] });
    expect((await f.removeNote()).status).toBe(409);
    expect(await MetadataRepository.getNoteMetadata(f.note.id)).not.toBeNull();
    const read = await f.actor.get(f.mediaPath).set('x-project-id', f.project.id);
    expect(read.status).toBe(200);
    expect(await RustFS.readFileUtf8(f.note.bucketPath, 'photo.png')).toBe('image');
  });

  it('blocks hidden references without disclosing their IDs, titles or storage paths', async () => {
    const f = await fixture();
    const hidden = await seedWorkspaceFixture({ owner: { id: 'hidden-owner', email: 'hidden@example.com' }, project: { id: 'hidden-project', key: 'HIDDEN', inviteCode: 'INV-HIDDEN'  }, workspace: { id: 'hidden-workspace', key: 'HIDDEN' } });
    const ref = await createNote(hidden.project.id, hidden.owner.id, 'Secret title', `[file](${f.mediaPath})`);
    expect((await f.removeMedia()).body).toEqual({ deleted: false, blocked: true, remainingReferences: [] });
    const noteResult = await f.removeNote();
    expect(noteResult.status).toBe(409);
    expect(JSON.stringify(noteResult.body)).not.toContain(ref.id);
    expect(JSON.stringify(noteResult.body)).not.toContain(ref.bucketPath);
  });

  it.each(['ENOENT', 'EACCES', 'malformed', 'inventory'])('fails closed and redacts diagnostics for %s', async failure => {
    const f = await fixture();
    const remove = vi.spyOn(RustFS, 'deleteFile');
    const bucket = vi.spyOn(NotesRepository, 'deleteBucket');
    const metadata = vi.spyOn(MetadataRepository, 'deleteNoteMetadata');
    const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => {});
    if (failure === 'inventory') vi.spyOn(MetadataRepository, 'listNotesForMediaCleanup').mockRejectedValue(new Error('secret inventory'));
    else if (failure === 'malformed') vi.spyOn(NotesRepository, 'getBody').mockResolvedValue('{"type":"doc",');
    else {
      const other = await createNote(f.project.id, f.actor.user.id, 'Unreadable', 'body');
      const getBody = NotesRepository.getBody;
      vi.spyOn(NotesRepository, 'getBody').mockImplementation((bucket, key) => {
        if (bucket === other.bucketPath) throw Object.assign(new Error('secret body'), { code: failure });
        return getBody(bucket, key);
      });
    }
    const media = await f.removeMedia();
    const note = await f.removeNote();
    expect(media.status).toBe(500);
    expect(note.status).toBe(500);
    expect(JSON.stringify([media.body, note.body])).not.toContain('secret');
    expect(JSON.stringify(diagnostics.mock.calls)).not.toContain('secret');
    expect(remove).not.toHaveBeenCalled();
    expect(bucket).not.toHaveBeenCalled();
    expect(metadata).not.toHaveBeenCalled();
  });

  it('rejects unauthorized deletion before scanning global notes', async () => {
    const f = await fixture();
    const outsider = await createAuthenticatedApi({ name: 'Outsider', email: 'outsider@example.com', role: 'developer' });
    const scan = vi.spyOn(MetadataRepository, 'listNotesForMediaCleanup');
    for (const path of [f.mediaPath, `/api/v1/notes/${f.note.id}`]) {
      expect((await outsider.delete(path).set('x-project-id', f.project.id)).status).toBe(403);
    }
    expect(scan).not.toHaveBeenCalled();
  });

  it('uses committed bodies, permits self-contained note deletion, and protects reserved objects', async () => {
    const f = await fixture();
    await RustFS.saveFile(f.note.bucketPath, 'body.md', `[stale](${f.mediaPath})`);
    await RustFS.saveFile(f.note.bucketPath, '.revisions/stale.md', `[stale](${f.mediaPath})`);
    const bodyRead = vi.spyOn(NotesRepository, 'getBody');
    const remove = vi.spyOn(RustFS, 'deleteFile');
    expect((await f.removeMedia()).body.deleted).toBe(true);
    expect(remove).toHaveBeenCalledWith(f.note.bucketPath, 'photo.png', '"test-version"');
    expect(bodyRead).toHaveBeenCalledWith(f.note.bucketPath, f.note.bodyKey);
    expect((await f.actor.delete(`/api/v1/notes/${f.note.id}/media/body.md`).set('x-project-id', f.project.id)).status).toBe(400);
    await expect(deleteNoteMedia(f.note.id, f.project.id, '.revisions/stale.md')).rejects.toThrow('reserved');
    await RustFS.saveFile(f.note.bucketPath, f.note.bodyKey, `[self](${f.mediaPath})`);
    expect((await f.removeNote()).status).toBe(200);
  });

  it('blocks self references for media deletion and missing target inventory for both paths', async () => {
    const f = await fixture();
    await RustFS.saveFile(f.note.bucketPath, f.note.bodyKey, `[self](${f.mediaPath})`);
    expect((await f.removeMedia()).body.blocked).toBe(true);
    vi.spyOn(MetadataRepository, 'listNotesForMediaCleanup').mockResolvedValue([]);
    await expect(deleteNoteMedia(f.note.id, f.project.id, 'photo.png')).rejects.toThrow('target missing');
    await expect(deleteNote(f.note.id, f.project.id)).rejects.toThrow('target missing');
    expect(await RustFS.readFileUtf8(f.note.bucketPath, 'photo.png')).toBe('image');
  });

  it.each(['ENOENT', 'NotFound', 'NoSuchKey'])('reports absent objects without deleting (%s)', async kind => {
    const f = await fixture();
    vi.spyOn(RustFS, 'statFile').mockRejectedValue(Object.assign(new Error('missing'), { code: kind, name: kind }));
    const remove = vi.spyOn(RustFS, 'deleteFile');
    expect((await f.removeMedia()).body).toEqual({ deleted: false, blocked: false, remainingReferences: [] });
    expect(remove).not.toHaveBeenCalled();
  });

  it('fails closed when the second inventory fails', async () => {
    const f = await fixture();
    const scan = vi.spyOn(MetadataRepository, 'listNotesForMediaCleanup');
    scan.mockResolvedValueOnce([f.note]).mockRejectedValueOnce(new Error('inventory unavailable'));
    const remove = vi.spyOn(RustFS, 'deleteFile');
    await expect(deleteNoteMedia(f.note.id, f.project.id, 'photo.png')).rejects.toThrow('inventory unavailable');
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a mismatched project without scanning or deleting', async () => {
    const f = await fixture();
    const scan = vi.spyOn(MetadataRepository, 'listNotesForMediaCleanup');
    expect(await deleteNoteMedia(f.note.id, 'wrong', 'photo.png')).toBeNull();
    expect(await deleteNote(f.note.id, 'wrong')).toBe(false);
    expect(scan).not.toHaveBeenCalled();
  });

  it('rechecks after HEAD', async () => {
    const f = await fixture();
    const remove = vi.spyOn(RustFS, 'deleteFile');
    vi.spyOn(RustFS, 'statFile').mockImplementation(async () => {
      await RustFS.saveFile(f.note.bucketPath, f.note.bodyKey, `[new](${f.mediaPath})`);
      return { etag: 'version', lastModified: new Date(0) };
    });
    expect((await f.removeMedia()).body.blocked).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });
  it('returns generic conflicts for create/update after a referenced source was deleted', async () => {
    const f = await fixture();
    const other = await createNote(f.project.id, f.actor.user.id, 'Other', 'Original');
    expect((await f.removeNote()).status).toBe(200);
    const body = `[stale](${f.mediaPath})`;
    const create = await f.actor.post('/api/v1/notes').set('x-project-id', f.project.id)
      .send({ title: 'New', body });
    const update = await f.actor.patch(`/api/v1/notes/${other.id}`).set('x-project-id', f.project.id)
      .send({ version: 1, body });
    for (const response of [create, update]) {
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: 'Note media references are unavailable; refresh the note and try again.' });
      expect(JSON.stringify(response.body)).not.toContain(f.note.id);
    }
    expect(await MetadataRepository.getNoteMetadata(other.id)).toMatchObject({ version: 1 });
  });

});
