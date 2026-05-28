import { describe, expect, it } from 'vitest';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { env } from '../src/env.js';

describe('MCP HMAC key rotation simulation', () => {
  it('rejects tokens created with old key when old secrets not retained, accepts when retained', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Rotation Owner',
      email: 'rotation-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const origSecret = env.betterAuthSecret;
    const origOld = Array.isArray(env.betterAuthOldSecrets) ? [...env.betterAuthOldSecrets] : [];

    try {
      // Simulate token issuance with an old secret
      const oldSecret = 'old-rot-secret-test-1';
      env.betterAuthSecret = oldSecret;
      env.betterAuthOldSecrets = [];

      const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
      expect(createRes.status).toBe(201);
      const rawToken = createRes.body.auth.token;

      // Rotate to a new secret but do NOT retain the old secret -> token should be rejected
      env.betterAuthSecret = 'new-rot-secret-test-1';
      env.betterAuthOldSecrets = [];

      const resRejected = await api()
        .post('/api/v1/mcp/sse')
        .set('Authorization', `Bearer ${rawToken}`)
        .set('X-Workspace-Id', workspace.id)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

      expect(resRejected.status).toBe(401);
      expect(resRejected.body).toEqual({ error: 'Invalid or expired token.' });

      // Now retain the old secret in rotation window -> token should be accepted once
      env.betterAuthOldSecrets = [oldSecret];

      const resAccepted = await api()
        .post('/api/v1/mcp/sse')
        .set('Authorization', `Bearer ${rawToken}`)
        .set('X-Workspace-Id', workspace.id)
        .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

      expect(resAccepted.status).toBe(200);
      expect(resAccepted.body).toMatchObject({ jsonrpc: '2.0', id: 2, result: { tools: expect.any(Array) } });

      // Second use must fail (single-use token consumed)
      const resSecond = await api()
        .post('/api/v1/mcp/sse')
        .set('Authorization', `Bearer ${rawToken}`)
        .set('X-Workspace-Id', workspace.id)
        .send({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });

      expect(resSecond.status).toBe(401);
    } finally {
      // Restore environment
      env.betterAuthSecret = origSecret;
      env.betterAuthOldSecrets = origOld;
    }
  });
});
