import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('createApp', () => {
  it('returns the ready payload at the root route', async () => {
    const response = await request(createApp()).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: 'gravity-server',
      status: 'ready',
    });
  });

  it('returns the health payload', async () => {
    const response = await request(createApp()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'gravity-server',
      nodeEnv: expect.any(String),
      authBaseUrl: expect.any(String),
    });
  });
});