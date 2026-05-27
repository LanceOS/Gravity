import { describe, expect, it } from 'vitest';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { mcpConnectionTokens } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('MCP connection endpoints', () => {
  it('creates a connection token and stores a hashed token', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'MCP Owner',
      email: 'mcp-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const res = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({ scopes: ['tools/list'], ttlSeconds: 300 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(String), token: expect.any(String), expires_at: expect.any(String) });

    const rows = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, res.body.id)).limit(1);
    const row = rows[0];
    expect(row).toBeTruthy();
    expect(row.status).toBe('active');
    expect(row.tokenHash).toBeTruthy();
  });

  it('revokes a token when requested by owner', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'MCP Owner Revoke',
      email: 'mcp-owner-revoke@example.com',
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

    const revokeRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection/${tokenId}/revoke`).send({});
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body).toMatchObject({ id: tokenId, revoked_at: expect.any(String) });

    const rows = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, tokenId)).limit(1);
    expect(rows[0].status).toBe('revoked');
    expect(rows[0].revokedAt).toBeTruthy();
  });

  it('accepts bearer token at MCP router and consumes single-use token', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'MCP Consumer',
      email: 'mcp-consumer@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/consumer.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
    expect(createRes.status).toBe(201);
    const rawToken = createRes.body.token;

    // First use should succeed
    const sseRes = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

    expect(sseRes.status).toBe(200);
    expect(sseRes.body).toMatchObject({ jsonrpc: '2.0', id: 1, result: { tools: expect.any(Array) } });

    // Second use should fail (single-use)
    const sseRes2 = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    expect(sseRes2.status).toBe(401);
    expect(sseRes2.body).toEqual({ error: 'Invalid or expired token.' });
  });
});
