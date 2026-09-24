import { describe, expect, it } from 'vitest';
import { createConnectionToken } from '../src/modules/mcp/connection.js';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

async function setup() {
  const ownerApi = await createAuthenticatedApi({ name: 'Connection limits owner', email: 'connection-limits@example.com' });
  const owner = ownerApi.user;
  const { workspace } = await seedWorkspaceFixture({ owner: { id: owner.id, name: owner.name, email: owner.email } });
  return { ownerApi, owner, workspace, path: `/api/v1/workspaces/${workspace.id}/mcp/connection` };
}

function expectRateLimited(response: { status: number; headers: Record<string, string>; body: any }) {
  expect(response.status).toBe(429);
  expect(response.body.retryAfterSeconds).toBeGreaterThan(0);
  expect(response.body.retryAfterSeconds).toBeLessThanOrEqual(60);
  expect(response.headers['retry-after']).toBe(String(response.body.retryAfterSeconds));
}

describe('MCP connection rate limits', () => {
  it('allows generation after ten old credentials are revoked, while keeping revocation capped', async () => {
    const { ownerApi, owner, workspace, path } = await setup();
    // Existing credentials were issued outside the current issuance window.
    const oldTokens = [];
    for (let index = 0; index < 11; index++) {
      oldTokens.push(await createConnectionToken({ workspaceId: workspace.id, generatedBy: owner.id }));
    }
    for (const token of oldTokens.slice(0, 10)) {
      expect((await ownerApi.post(`${path}/${token.id}/revoke`).send({})).status).toBe(200);
    }
    expectRateLimited(await ownerApi.post(`${path}/${oldTokens[10].id}/revoke`).send({}));

    const generated = await ownerApi.post(path).send({ scopes: ['tools/list', 'tools/call:get_workspace'] });
    expect(generated.status).toBe(201);
    const read = await ownerApi.post('/api/v1/mcp')
      .set('Authorization', `Bearer ${generated.body.auth.token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_workspace', arguments: {} } });
    expect(read.status).toBe(200);
    expect(read.body.result.structuredContent.data.id).toBe(workspace.id);
  });

  it('shares generation and refresh limits without blocking revocation', async () => {
    const { ownerApi, path } = await setup();
    const generated = await ownerApi.post(path).send({});
    expect(generated.status).toBe(201);
    const tokenId = generated.body.id;
    for (let index = 0; index < 9; index++) {
      expect((await ownerApi.post(`${path}/${tokenId}/refresh`).send({})).status).toBe(200);
    }
    expectRateLimited(await ownerApi.post(path).send({}));
    expectRateLimited(await ownerApi.post(`${path}/${tokenId}/refresh`).send({}));
    expect((await ownerApi.post(`${path}/${tokenId}/revoke`).send({})).status).toBe(200);
  });
});
