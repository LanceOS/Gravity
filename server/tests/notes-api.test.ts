import { describe, expect, it, vi } from 'vitest';
import { MetadataRepository } from '../src/modules/notes/repositories.js';
import { RustFS } from '../src/lib/rustfs.js';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

describe('notes routes', () => {
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
