import { describe, expect, it, vi } from 'vitest';
import { MetadataRepository } from '../src/modules/notes/repositories.js';
import { RustFS } from '../src/lib/rustfs.js';
import { withNoteReferenceLock } from '../src/modules/notes/reference-lock.js';
import { createMediaDeletionClaim } from '../src/modules/notes/services/media-claims.js';
import { noteMediaDeletions } from '../src/modules/notes/schema.js';
import { db } from '../src/db/index.js';
import { workspaceMembers } from '../src/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { cleanupNoteMediaForActor, deleteNoteForActor, getNoteForActor, listNotesForActor, updateNoteForActor } from '../src/modules/notes/services/notes.js';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

describe('notes routes', () => {
  it('rechecks membership and role for direct service callers and cached API sessions', async () => {
    const owner = await createAuthenticatedApi({ email: 'fresh-owner@example.com', role: 'owner' });
    const member = await createAuthenticatedApi({ email: 'fresh-member@example.com' });
    const admin = await createAuthenticatedApi({ email: 'fresh-admin@example.com' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar } });
    await db.insert(workspaceMembers).values([
      { workspaceId: workspace.id, userId: member.user.id, role: 'member' },
      { workspaceId: workspace.id, userId: admin.user.id, role: 'admin' },
    ]);
    const scope = { 'x-project-id': project.id };
    const shared = await owner.post('/api/v1/notes').set(scope).send({ title: 'Shared', body: 'body', visibility: 'shared' });
    const privateNote = await owner.post('/api/v1/notes').set(scope).send({ title: 'Private', body: 'secret' });
    const forgedMember = { userId: member.user.id, workspaceRole: 'owner' };
    expect(await deleteNoteForActor(shared.body.id, project.id, forgedMember)).toBe(false);
    await expect(updateNoteForActor(shared.body.id, project.id, forgedMember, 1, { visibility: 'private' })).rejects.toThrow('NOT_FOUND');
    expect(await getNoteForActor(privateNote.body.id, project.id, { userId: admin.user.id, workspaceRole: 'owner' })).toBeNull();

    await db.update(workspaceMembers).set({ role: 'member' }).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, admin.user.id)));
    expect(await deleteNoteForActor(shared.body.id, project.id, { userId: admin.user.id, workspaceRole: 'admin' })).toBe(false);
    expect((await member.get(`/api/v1/notes/${shared.body.id}`).set(scope)).status).toBe(200); // Warm the cached route membership.
    await db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, member.user.id)));
    expect((await member.get('/api/v1/notes').set(scope)).status).toBe(403);
    expect((await member.get(`/api/v1/notes/${shared.body.id}`).set(scope)).status).toBe(403);
    await expect(listNotesForActor(project.id, forgedMember)).rejects.toThrow('NOTE_ACCESS_DENIED');
    expect(await getNoteForActor(shared.body.id, project.id, forgedMember)).toBeNull();
    await expect(updateNoteForActor(shared.body.id, project.id, forgedMember, 1, { body: 'stolen' })).rejects.toThrow('NOT_FOUND');
  });

  it.each(['revocation', 'unshare'])('blocks a queued shared-note write after %s', async change => {
    const owner = await createAuthenticatedApi({ email: `race-owner-${change}@example.com`, role: 'owner' });
    const member = await createAuthenticatedApi({ email: `race-member-${change}@example.com` });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar } });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: member.user.id, role: 'member' });
    const scope = { 'x-project-id': project.id };
    const created = await owner.post('/api/v1/notes').set(scope).send({ title: 'Shared', body: 'original', visibility: 'shared' });
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const releasePromise = new Promise<void>(resolve => { release = resolve; });
    const save = RustFS.saveFile;
    vi.spyOn(RustFS, 'saveFile').mockImplementationOnce(async (...args) => {
      entered();
      await releasePromise;
      return save(...args);
    });
    const pending = updateNoteForActor(created.body.id, project.id, { userId: member.user.id, workspaceRole: 'owner' }, 1, { body: 'late write' });
    const rejected = expect(pending).rejects.toThrow('NOT_FOUND');
    await enteredPromise;
    if (change === 'revocation') {
      await db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, member.user.id)));
    } else {
      expect((await owner.patch(`/api/v1/notes/${created.body.id}`).set(scope).send({ version: 1, visibility: 'private' })).status).toBe(200);
    }
    release();
    await rejected;
    const current = await owner.get(`/api/v1/notes/${created.body.id}`).set(scope);
    expect(current.body.body).toBe('original');
    expect(current.body.version).toBe(change === 'unshare' ? 2 : 1);
  });

  it('rechecks cleanup permission before claiming an orphan after unshare', async () => {
    const owner = await createAuthenticatedApi({ email: 'cleanup-race-owner@example.com', role: 'owner' });
    const author = await createAuthenticatedApi({ email: 'cleanup-race-author@example.com' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar } });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: author.user.id, role: 'member' });
    const scope = { 'x-project-id': project.id };
    const created = await author.post('/api/v1/notes').set(scope).send({ title: 'Shared', body: 'body', visibility: 'shared' });
    await RustFS.saveFile(created.body.bucketPath, 'orphan.png', 'old attachment');
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const releasePromise = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(RustFS, 'statFile').mockImplementationOnce(async () => {
      entered();
      await releasePromise;
      return { etag: 'old-version', lastModified: new Date(0) };
    });
    const remove = vi.spyOn(RustFS, 'deleteFile');
    const pending = cleanupNoteMediaForActor(created.body.id, project.id, { userId: owner.user.id, workspaceRole: 'owner' });
    const rejected = expect(pending).rejects.toThrow('NOT_FOUND');
    await enteredPromise;
    expect((await author.patch(`/api/v1/notes/${created.body.id}`).set(scope).send({ version: 1, visibility: 'private' })).status).toBe(200);
    release();
    await rejected;
    expect(remove).not.toHaveBeenCalled();
    expect(await RustFS.readFileUtf8(created.body.bucketPath, 'orphan.png')).toBe('old attachment');
  });
  it('keeps private notes author-only and shares opted-in notes with workspace members', async () => {
    const owner = await createAuthenticatedApi({ email: 'privacy-owner@example.com', role: 'owner' });
    const member = await createAuthenticatedApi({ email: 'privacy-member@example.com' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar } });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: member.user.id, role: 'member' });
    const scope = { 'x-project-id': project.id };
    const privateNote = await member.post('/api/v1/notes').set(scope).send({ title: 'Author private', body: 'private needle' });
    expect(privateNote.status).toBe(201);
    expect(privateNote.body.visibility).toBe('private');
    const id = privateNote.body.id;

    expect((await owner.get('/api/v1/notes').set(scope)).body).toEqual([]);
    expect((await owner.get('/api/v1/notes/search?q=needle').set(scope)).body).toEqual([]);
    expect((await owner.get(`/api/v1/notes/${id}`).set(scope)).status).toBe(404);
    expect((await owner.patch(`/api/v1/notes/${id}`).set(scope).send({ version: 1, title: 'stolen' })).status).toBe(404);
    expect((await owner.delete(`/api/v1/notes/${id}`).set(scope)).status).toBe(404);
    expect((await owner.post(`/api/v1/notes/${id}/media?filename=private.txt`).set(scope).set('Content-Type', 'application/octet-stream').send(Buffer.from('secret'))).status).toBe(404);
    expect((await owner.get(`/api/v1/notes/${id}/media/private.txt`).set(scope)).status).toBe(404);
    expect((await owner.delete(`/api/v1/notes/${id}/media/private.txt`).set(scope)).status).toBe(404);
    expect((await owner.post(`/api/v1/notes/${id}/cleanup?dryRun=true`).set(scope)).status).toBe(404);

    const shared = await member.patch(`/api/v1/notes/${id}`).set(scope).send({ version: 1, visibility: 'shared' });
    expect(shared.status).toBe(200);
    expect(shared.body.visibility).toBe('shared');
    expect((await owner.get('/api/v1/notes').set(scope)).body).toEqual([expect.objectContaining({ id, visibility: 'shared', userId: member.user.id })]);
    expect((await owner.get('/api/v1/notes/search?q=needle').set(scope)).body).toEqual([expect.objectContaining({ id })]);
    expect((await owner.get(`/api/v1/notes/${id}`).set(scope)).body.body).toBe('private needle');
    const ownerEdit = await owner.patch(`/api/v1/notes/${id}`).set(scope).send({ version: 2, title: 'owner edit' });
    expect(ownerEdit.status).toBe(200);
    expect(ownerEdit.body.visibility).toBe('shared');
    expect((await owner.post(`/api/v1/notes/${id}/media?filename=shared.txt`).set(scope).set('Content-Type', 'application/octet-stream').send(Buffer.from('shared file'))).status).toBe(201);
    expect((await member.get(`/api/v1/notes/${id}/media/shared.txt`).set(scope)).status).toBe(200);
    const sharedCleanup = await owner.post(`/api/v1/notes/${id}/cleanup?dryRun=true`).set(scope);
    expect(sharedCleanup.status, JSON.stringify(sharedCleanup.body)).toBe(200);
    expect((await owner.delete(`/api/v1/notes/${id}/media/shared.txt`).set(scope)).status).toBe(200);
    expect((await owner.delete(`/api/v1/notes/${id}`).set(scope)).status).toBe(200);
  });

  it('limits shared note management to its author or an owner and rejects foreign workspaces', async () => {
    const owner = await createAuthenticatedApi({ email: 'scope-owner@example.com', role: 'owner' });
    const member = await createAuthenticatedApi({ email: 'scope-member@example.com' });
    const admin = await createAuthenticatedApi({ email: 'scope-admin@example.com' });
    const outsider = await createAuthenticatedApi({ email: 'scope-outsider@example.com' });
    const first = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar } });
    const second = await seedWorkspaceFixture({ owner: { ...outsider.user, avatarUrl: outsider.user.avatar }, workspace: { id: 'privacy-other-workspace', key: 'PRIVOTHER' }, project: { id: 'privacy-other-project', key: 'PRIVOTHER', inviteCode: 'INV-PRIVOTHER' } });
    await db.insert(workspaceMembers).values([
      { workspaceId: first.workspace.id, userId: member.user.id, role: 'member' },
      { workspaceId: first.workspace.id, userId: admin.user.id, role: 'admin' },
    ]);
    const scope = { 'x-project-id': first.project.id };
    const created = await owner.post('/api/v1/notes').set(scope).send({ title: 'Shared', body: 'shared search token', visibility: 'shared' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await member.get(`/api/v1/notes/${id}`).set(scope)).status).toBe(200);
    expect((await member.patch(`/api/v1/notes/${id}`).set(scope).send({ version: 1, visibility: 'private' })).status).toBe(404);
    expect((await member.delete(`/api/v1/notes/${id}`).set(scope)).status).toBe(404);
    expect((await member.post(`/api/v1/notes/${id}/cleanup?dryRun=true`).set(scope)).status).toBe(404);
    expect((await member.patch(`/api/v1/notes/${id}`).set(scope).send({ version: 1, body: 'member edit' })).status).toBe(200);
    expect((await member.post(`/api/v1/notes/${id}/media?filename=member.txt`).set(scope).set('Content-Type', 'application/octet-stream').send(Buffer.from('member file'))).status).toBe(201);
    expect((await admin.get(`/api/v1/notes/${id}/media/member.txt`).set(scope)).status).toBe(200);
    expect((await member.delete(`/api/v1/notes/${id}/media/member.txt`).set(scope)).status).toBe(404);
    const memberPrivate = await member.post('/api/v1/notes').set(scope).send({ title: 'Member private', body: 'hidden' });
    expect((await admin.get(`/api/v1/notes/${memberPrivate.body.id}`).set(scope)).status).toBe(404);
    expect((await admin.delete(`/api/v1/notes/${memberPrivate.body.id}`).set(scope)).status).toBe(404);
    expect((await admin.patch(`/api/v1/notes/${id}`).set(scope).send({ version: 2, visibility: 'private' })).status).toBe(200);
    expect((await member.get(`/api/v1/notes/${id}`).set(scope)).status).toBe(404);
    expect((await member.get(`/api/v1/notes/${id}/media/member.txt`).set(scope)).status).toBe(404);
    expect((await outsider.get('/api/v1/notes').set(scope)).status).toBe(403);
    expect((await outsider.get(`/api/v1/notes/${id}`).set(scope)).status).toBe(403);
    expect((await outsider.get(`/api/v1/notes/${id}/media/shared.txt`).set(scope)).status).toBe(403);
    expect((await outsider.get(`/api/v1/notes/${id}/media/shared.txt`)).status).toBe(404);
    expect((await member.get(`/api/v1/notes/${id}`).set('x-project-id', second.project.id)).status).toBe(403);
    expect((await outsider.get(`/api/v1/notes/${id}`).set('x-project-id', second.project.id)).status).toBe(404);
  });
  it('creates, retrieves, lists, updates and deletes notes', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Test Owner',
      email: 'owner@example.com',
      role: 'owner',
    });
    const owner = ownerApi.user;
    
    const { project } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
    });

    // 1. Create a note
    const createResponse = await ownerApi
      .post('/api/v1/notes')
      .set('x-project-id', project.id)
      .send({
        title: 'Meeting Notes',
        body: '# Daily Standup\n- Everything is on track',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      title: 'Meeting Notes',
      body: '# Daily Standup\n- Everything is on track',
      projectId: project.id,
      userId: owner.id,
      version: 1,
    });
    
    const noteId = createResponse.body.id;

    // 2. Get the note
    const getResponse = await ownerApi
      .get(`/api/v1/notes/${noteId}`)
      .set('x-project-id', project.id);
      
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.title).toBe('Meeting Notes');
    expect(getResponse.body.body).toBe('# Daily Standup\n- Everything is on track');

    // 3. List notes
    const listResponse = await ownerApi
      .get('/api/v1/notes')
      .set('x-project-id', project.id);
      
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.length).toBe(1);
    expect(listResponse.body[0].id).toBe(noteId);

    // 4. Update note
    const patchResponse = await ownerApi
      .patch(`/api/v1/notes/${noteId}`)
      .set('x-project-id', project.id)
      .send({
        version: 1,
        title: 'Updated Meeting Notes',
        body: 'New body content',
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.title).toBe('Updated Meeting Notes');
    expect(patchResponse.body.body).toBe('New body content');
    expect(patchResponse.body.version).toBe(2);

    // 4a. Optimistic locking failure (using old version)
    const patchConflictResponse = await ownerApi
      .patch(`/api/v1/notes/${noteId}`)
      .set('x-project-id', project.id)
      .send({
        version: 1,
        title: 'Conflicting update',
      });
    expect(patchConflictResponse.status).toBe(409);

    // 5. Delete note
    const deleteResponse = await ownerApi
      .delete(`/api/v1/notes/${noteId}`)
      .set('x-project-id', project.id);
      
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ success: true });

    // 5a. Verify deletion
    const getDeletedResponse = await ownerApi
      .get(`/api/v1/notes/${noteId}`)
      .set('x-project-id', project.id);
    expect(getDeletedResponse.status).toBe(404);
  });

  it('supports cleanup dry run, preserves recent uploads, and reports missing bodies', async () => {
    const ownerApi = await createAuthenticatedApi({ name: 'Cleanup Owner', email: 'cleanup@example.com', role: 'owner' });
    const { project } = await seedWorkspaceFixture({ owner: {
      id: ownerApi.user.id, name: ownerApi.user.name, email: ownerApi.user.email,
      role: 'owner', avatarUrl: ownerApi.user.avatar,
    } });
    const created = await ownerApi.post('/api/v1/notes').set('x-project-id', project.id)
      .send({ title: 'Cleanup', body: 'No attachment yet' });
    expect(created.status).toBe(201);
    const { id, bucketPath } = created.body;
    await RustFS.saveFile(bucketPath, 'pending.png', 'pending upload');
    const remove = vi.spyOn(RustFS, 'deleteFile');
    const stat = vi.spyOn(RustFS, 'statFile').mockResolvedValue({ lastModified: new Date(), etag: 'new' });
    const dry = await ownerApi.post(`/api/v1/notes/${id}/cleanup?dryRun=true`).set('x-project-id', project.id);
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ cleanedFiles: [], orphanedFiles: ['pending.png'] });
    expect(remove).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();
    const cleanup = await ownerApi.post(`/api/v1/notes/${id}/cleanup`).set('x-project-id', project.id);
    expect(cleanup.status).toBe(200);
    expect(cleanup.body).toMatchObject({ cleanedFiles: [], deferredFiles: ['pending.png'] });
    expect(remove).not.toHaveBeenCalled();
    vi.spyOn(RustFS, 'readFileUtf8').mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const missing = await ownerApi.post(`/api/v1/notes/${id}/cleanup`).set('x-project-id', project.id);
    expect(missing.status).toBe(500);
    expect(missing.body.error).toBe('Media cleanup blocked; see server diagnostics.');
    expect(diagnostic).toHaveBeenCalledWith('Note API failure', expect.objectContaining({ requestId: missing.body.requestId, operation: '/notes/:noteId/cleanup' }));
    expect(remove).not.toHaveBeenCalled();
  });

  it('returns a safe conflict for a filename with an ambiguous deletion claim', async () => {
    const owner = await createAuthenticatedApi({ email: 'media-claim-owner@example.com' });
    const { project } = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar } });
    const created = await owner.post('/api/v1/notes').set('x-project-id', project.id)
      .send({ title: 'Media claim', body: 'Body' });
    expect(created.status).toBe(201);
    await withNoteReferenceLock(async tx => {
      await createMediaDeletionClaim(created.body.id, created.body.bucketPath, 'photo.png', 'old-etag', tx);
      await tx.update(noteMediaDeletions).set({ status: 'ambiguous' });
    });
    const blocked = await owner.post(`/api/v1/notes/${created.body.id}/media?filename=photo.png`)
      .set('x-project-id', project.id).set('Content-Type', 'application/octet-stream').send(Buffer.from('new photo'));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain('Upload with another filename');
    const renamed = await owner.post(`/api/v1/notes/${created.body.id}/media?filename=renamed.png`)
      .set('x-project-id', project.id).set('Content-Type', 'application/octet-stream').send(Buffer.from('new photo'));
    expect(renamed.status).toBe(201);
  });

  it('preserves content and revision after rejected updates', async () => {
    const ownerApi = await createAuthenticatedApi({ name: 'Validation Owner', email: 'validation@example.com', role: 'owner' });
    const { project } = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id, name: ownerApi.user.name, email: ownerApi.user.email, role: 'owner' } });
    const created = await ownerApi.post('/api/v1/notes').set('x-project-id', project.id).send({ title: 'Original', body: 'Original body' });
    expect(created.status).toBe(201);
    for (const patch of [{ version: 1, body: {} }, { version: null, body: 'changed' }, { version: 1, title: '' }]) {
      const rejected = await ownerApi.patch(`/api/v1/notes/${created.body.id}`).set('x-project-id', project.id).send(patch);
      expect(rejected.status).toBe(400);
      expect(rejected.body.requestId).toBe(rejected.headers['x-request-id']);
    }
    const unchanged = await ownerApi.get(`/api/v1/notes/${created.body.id}`).set('x-project-id', project.id);
    expect(unchanged.body).toMatchObject({ title: 'Original', body: 'Original body', version: 1 });
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secret = 'synthetic-private-database-detail';
    for (const fail of [
      () => vi.spyOn(RustFS, 'saveFile').mockRejectedValueOnce(new Error(secret)),
      () => vi.spyOn(MetadataRepository, 'updateNoteMetadata').mockRejectedValueOnce(new Error(secret)),
    ]) {
      fail();
      const failed = await ownerApi.patch(`/api/v1/notes/${created.body.id}`).set('x-project-id', project.id).send({ version: 1, body: 'uncommitted' });
      expect(failed.status).toBe(500);
      expect(failed.body).toMatchObject({ code: 'INTERNAL_ERROR', requestId: failed.headers['x-request-id'] });
      expect(JSON.stringify(failed.body)).not.toContain(secret);
      const preserved = await ownerApi.get(`/api/v1/notes/${created.body.id}`).set('x-project-id', project.id);
      expect(preserved.body).toMatchObject({ title: 'Original', body: 'Original body', version: 1 });
    }
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(secret);
  });

  it('uses the production parser for rich text, malformed requests and raw attachments', async () => {
    const owner = await createAuthenticatedApi({ email: 'parser-owner@example.com' });
    const { project } = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar } });
    const rich = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Café 😀' }] }] });
    const created = await owner.post('/api/v1/NOTES/').set('x-project-id', project.id).send({ title: 'Rich text', body: rich });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ body: rich, excerpt: 'Café 😀' });
    const malformed = await owner.post('/api/v1/notes').set('Content-Type', 'application/json').send('{invalid');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ code: 'INVALID_INPUT', requestId: malformed.headers['x-request-id'] });
    const encoded = await owner.get('/api/v1/notes/%ZZ').set('x-project-id', project.id);
    expect(encoded.status).toBe(400);
    expect(encoded.body.code).toBe('INVALID_INPUT');
    for (const content of ['{raw file}', '']) {
      const upload = await owner.post(`/api/v1/NOTES/${created.body.id}/MEDIA/?filename=raw.txt`).set('x-project-id', project.id).set('Content-Type', 'application/json').send(content);
      expect(upload.status).toBe(201);
      const downloaded = await owner.get(upload.body.url);
      expect(downloaded.status).toBe(200);
      expect(downloaded.text).toBe(content);
    }
  });

  it('enforces workspace/project authorization', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Owner Two',
      email: 'owner2@example.com',
      role: 'owner',
    });
    
    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post('/api/v1/notes')
      .set('x-project-id', project.id)
      .send({ title: 'My Note', body: 'Content' });
      
    const noteId = createResponse.body.id;

    const unauthorizedApi = await createAuthenticatedApi({
      name: 'Hacker',
      email: 'hacker@example.com',
      role: 'developer',
    });

    // Hacker tries to read the note by sending the valid project ID but without membership
    const unauthorizedGet = await unauthorizedApi
      .get(`/api/v1/notes/${noteId}`)
      .set('x-project-id', project.id);
    expect(unauthorizedGet.status).toBe(403);
  });
});
