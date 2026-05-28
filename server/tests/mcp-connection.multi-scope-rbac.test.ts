import { describe, expect, it } from 'vitest';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

describe('MCP token multi-use, scopes, and RBAC', () => {
  it('allows multi-use tokens when singleUse=false', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Multi Use Owner',
      email: 'multi-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({ singleUse: false });
    expect(createRes.status).toBe(201);
    const rawToken = createRes.body.token;

    // First use
    const first = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ jsonrpc: '2.0', id: 1, result: { tools: expect.any(Array) } });

    // Second use should also succeed for multi-use token
    const second = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ jsonrpc: '2.0', id: 2, result: { tools: expect.any(Array) } });
  });

  it('rejects tools/call when token lacks tools/call scope', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Scope Owner',
      email: 'scope-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({ scopes: ['tools/list'] });
    expect(createRes.status).toBe(201);
    const rawToken = createRes.body.token;

    const callRes = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'some_tool', arguments: {} } });

    expect(callRes.status).toBe(403);
    expect(callRes.body).toEqual({ error: 'Insufficient token scopes.' });
  });

  it('enforces RBAC: non-members cannot create or revoke tokens', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'RBAC Owner',
      email: 'rbac-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const otherApi = await createAuthenticatedApi({
      name: 'Non Member',
      email: 'nonmember@example.com',
      role: 'guest_contributor',
      avatarUrl: 'https://example.com/other.png',
    });

    // Non-member cannot create token
    const createRes = await otherApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
    expect(createRes.status).toBe(403);
    expect(createRes.body).toEqual({ error: 'Workspace membership required.' });

    // Owner creates a token
    const ownerCreate = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
    expect(ownerCreate.status).toBe(201);
    const tokenId = ownerCreate.body.id;

    // Non-member cannot revoke someone else's token
    const revokeRes = await otherApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection/${tokenId}/revoke`).send({});
    expect(revokeRes.status).toBe(403);
    expect(revokeRes.body).toEqual({ error: 'Insufficient privileges to revoke token.' });
  });
});
