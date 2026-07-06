import { describe, expect, it } from 'vitest';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

describe('users and settings routes', () => {
  it('lists users and updates tutorial completion', async () => {
    const userApi = await createAuthenticatedApi({
      name: 'Tutorial User',
      email: 'tutorial@example.com',
      role: 'owner',
    });
    const user = userApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'owner',
        avatarUrl: user.avatar,
      },
    });

    const listResponse = await userApi.get('/api/v1/users').query({ workspaceId: workspace.id });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: user.id,
        name: user.name,
        email: user.email,
        tutorial_completed: 0,
      }),
    ]);

    const updateResponse = await userApi.patch(`/api/v1/users/${user.id}/tutorial`).send({ completed: true });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.user).toMatchObject({
      id: user.id,
      name: user.name,
      email: user.email,
      tutorial_completed: 1,
    });
  });

  it('returns and updates user settings', async () => {
    const userApi = await createAuthenticatedApi({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    const user = userApi.user;

    const getResponse = await userApi.get(`/api/v1/settings/${user.id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toMatchObject({
      userId: user.id,
      defaultView: 'board',
      theme: 'dark',
      aiProvider: 'openai',
      projectLayout: 'standard',
      apiKey: '',
    });

    const patchResponse = await userApi
      .patch(`/api/v1/settings/${user.id}`)
      .send({
        defaultView: 'list',
        theme: 'coffee',
        keyAction: 'update',
        apiKey: 'sk-test-123',
        aiProvider: 'anthropic',
        projectLayout: 'condensed',
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      userId: user.id,
      defaultView: 'list',
      theme: 'coffee',
      apiKey: '••••••••••••',
      aiProvider: 'anthropic',
      projectLayout: 'condensed',
    });
  });

  it('rejects cross-user and invalid settings updates', async () => {
    const userApi = await createAuthenticatedApi({
      email: 'settings-user@example.com',
    });
    const otherUserApi = await createAuthenticatedApi({
      email: 'settings-other-user@example.com',
    });
    const user = userApi.user;

    const forbiddenGetResponse = await otherUserApi.get(`/api/v1/settings/${user.id}`);
    expect(forbiddenGetResponse.status).toBe(403);
    expect(forbiddenGetResponse.body).toEqual({ error: 'Forbidden.' });



    const forbiddenPatchResponse = await otherUserApi
      .patch(`/api/v1/settings/${user.id}`)
      .send({ theme: 'light' });
    expect(forbiddenPatchResponse.status).toBe(403);
    expect(forbiddenPatchResponse.body).toEqual({ error: 'Forbidden.' });

    const invalidPatchResponse = await userApi
      .patch(`/api/v1/settings/${user.id}`)
      .send({ keyAction: 'keep', projectLayout: 'kanban' });
    expect(invalidPatchResponse.status).toBe(400);
    expect(invalidPatchResponse.body).toEqual({ error: 'Invalid projectLayout.' });

    const missingKeyActionResponse = await userApi
      .patch(`/api/v1/settings/${user.id}`)
      .send({ theme: 'coffee' });
    expect(missingKeyActionResponse.status).toBe(400);
    expect(missingKeyActionResponse.body).toEqual({
      error: 'keyAction is required and must be one of: update, clear, keep.',
    });
  });
});
