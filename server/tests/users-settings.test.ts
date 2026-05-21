import { describe, expect, it } from 'vitest';
import { api, seedUser } from './helpers/test-helpers.js';

describe('users and settings routes', () => {
  it('lists users and updates tutorial completion', async () => {
    const user = await seedUser();

    const listResponse = await api().get('/api/v1/users');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: user.id,
        name: user.name,
        email: user.email,
        tutorial_completed: 0,
      }),
    ]);

    const updateResponse = await api().patch(`/api/v1/users/${user.id}/tutorial`).send({ completed: true });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.user).toMatchObject({
      id: user.id,
      name: user.name,
      email: user.email,
      tutorial_completed: 1,
    });
  });

  it('returns and updates user settings', async () => {
    const user = await seedUser();

    const getResponse = await api().get(`/api/v1/settings/${user.id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toMatchObject({
      userId: user.id,
      defaultView: 'board',
      ollamaModel: '',
      ollamaEndpoint: 'http://localhost:11434',
      theme: 'dark',
      aiProvider: 'openai',
      projectLayout: 'standard',
      apiKey: '',
    });

    const patchResponse = await api().patch(`/api/v1/settings/${user.id}`).send({
      defaultView: 'list',
      ollamaModel: 'llama3.2',
      ollamaEndpoint: 'http://ollama.internal:11434',
      theme: 'light',
      apiKey: 'sk-test-123',
      aiProvider: 'anthropic',
      projectLayout: 'kanban',
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      userId: user.id,
      defaultView: 'list',
      ollamaModel: 'llama3.2',
      ollamaEndpoint: 'http://ollama.internal:11434',
      theme: 'light',
      apiKey: 'sk-test-123',
      aiProvider: 'anthropic',
      projectLayout: 'kanban',
    });
  });
});