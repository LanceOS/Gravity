import { describe, expect, it } from 'vitest';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

describe('MCP tools/call granular scopes', () => {
  it('allows calling a tool when token has tools/call:<tool> scope and rejects other tools', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Granular Owner',
      email: 'granular-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    // Issue token scoped only to the list_tickets tool
    const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({ scopes: ['tools/call:list_tickets'], singleUse: false });
    expect(createRes.status).toBe(201);
    const rawToken = createRes.body.token;

    // Should be allowed to call list_tickets
    const allowed = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } });

    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ jsonrpc: '2.0', id: 1 });

    // Should NOT be allowed to call get_ticket_details
    const rejected = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_ticket_details', arguments: { ticketKey: 'T-1' } } });

    expect(rejected.status).toBe(200);
    expect(rejected.body).toEqual({ jsonrpc: '2.0', id: 2, error: { code: -32001, message: 'Insufficient token scopes.' } });
  });

  it('allows any tools when token has global tools/call scope', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Global Call Owner',
      email: 'global-call-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({ scopes: ['tools/call'] });
    expect(createRes.status).toBe(201);
    const rawToken = createRes.body.token;

    const callRes = await api()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } });

    expect(callRes.status).toBe(200);
    expect(callRes.body).toMatchObject({ jsonrpc: '2.0', id: 3 });
  });
});
