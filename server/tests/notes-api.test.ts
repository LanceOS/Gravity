import { describe, expect, it } from 'vitest';
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
