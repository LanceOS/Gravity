import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { workspaces } from '../src/db/schema.js';
import { env } from '../src/env.js';
import { api, createAuthenticatedApi } from './helpers/test-helpers.js';

describe('OAuth discovery under production CSRF protection', () => {
  it('challenges cookie-less and signed-in clients while keeping legacy session routes protected', async () => {
    const account = await createAuthenticatedApi({ email: 'oauth-production-csrf@example.com' });
    await db.insert(workspaces).values({ id: 'csrf-oauth', name: 'OAuth', key: 'OAUTH', workspaceKey: 'private-key', createdBy: account.user.id });
    const oldEnvironment = env.nodeEnv;
    env.nodeEnv = 'production';
    try {
      const endpoint = '/api/v1/workspaces/csrf-oauth/mcp';
      const body = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'OAuth discovery test', version: '1' } } };
      const discovery = await api().post(endpoint).send(body);
      expect(discovery.status).toBe(401);
      expect(discovery.headers['www-authenticate']).toContain(`/.well-known/oauth-protected-resource${endpoint}`);

      // Even a valid workspace owner's session cannot authorize this endpoint.
      const ambientCookie = await account.post(endpoint).send(body);
      expect(ambientCookie.status).toBe(401);
      const browser = await account.post(endpoint).set('Origin', new URL(env.betterAuthBaseUrl).origin).send(body);
      expect(browser.status).toBe(401);

      const legacy = await account.post('/api/v1/mcp').set('X-Workspace-Id', 'csrf-oauth').send(body);
      expect(legacy.status).toBe(403);
      const consent = await account.post('/api/v1/mcp/oauth/requests/unknown').send({ approved: true });
      expect(consent.status).toBe(403);
    } finally {
      env.nodeEnv = oldEnvironment;
    }
  });

  it('does not let manual credentials masquerade as an OAuth grant', async () => {
    const account = await createAuthenticatedApi({ email: 'oauth-reserved-type@example.com' });
    await db.insert(workspaces).values({ id: 'reserved-oauth', name: 'OAuth', key: 'OAUTH', workspaceKey: 'private-key', createdBy: account.user.id });
    const response = await account.post('/api/v1/workspaces/reserved-oauth/mcp/connection')
      .send({ scopes: ['tools/list'], connectionType: 'oauth' });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/consent/);
  });
});
