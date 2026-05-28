import { describe, expect, it } from 'vitest';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { mcpConnectionTokens } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('MCP connection edge cases', () => {
  it('rejects expired tokens', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Expired Token Owner',
      email: 'expired-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
    expect(createRes.status).toBe(201);
    const tokenId = createRes.body.id;
    const rawToken = createRes.body.auth.token;

    // Force the token to be expired
    await db.update(mcpConnectionTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(mcpConnectionTokens.id, tokenId));

    const res = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token.' });
  });

  it('rejects revoked tokens', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Revoke Token Owner',
      email: 'revoke-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
    expect(createRes.status).toBe(201);
    const tokenId = createRes.body.id;
    const rawToken = createRes.body.auth.token;

    // Revoke via the API
    const revokeRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection/${tokenId}/revoke`).send({});
    expect(revokeRes.status).toBe(200);

    const res = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token.' });
  });

  it('rejects token used with wrong workspace id', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Wrong Workspace Owner',
      email: 'wrong-workspace-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
    expect(createRes.status).toBe(201);
    const rawToken = createRes.body.auth.token;

    const res = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', 'other-workspace')
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token.' });
  });

  it('rejects tampered tokens', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Tamper Owner',
      email: 'tamper-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
    expect(createRes.status).toBe(201);
    const rawToken = createRes.body.auth.token;

    // Tamper the token (flip last character)
    const tampered = rawToken.slice(0, -1) + (rawToken.slice(-1) === 'a' ? 'b' : 'a');

    const res = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${tampered}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token.' });
  });
});
