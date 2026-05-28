import { describe, it, expect } from 'vitest';
import { createAuthenticatedApi, seedWorkspaceFixture, api } from '../helpers/test-helpers.js';

describe('MCP concurrency', () => {
  it(
    'allows only one consumer to successfully use a single-use token under concurrent requests',
    async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Concurrency Owner',
      email: `concurrency-owner-${Date.now()}@example.com`,
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

    const concurrency = 12;
    const promises = Array.from({ length: concurrency }).map((_, i) =>
      api()
        .post('/api/v1/mcp/sse')
        .set('Authorization', `Bearer ${rawToken}`)
        .set('X-Workspace-Id', workspace.id)
        .send({ jsonrpc: '2.0', id: i + 1, method: 'tools/list', params: {} }),
    );

    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.status === 200).length;
    const unauthorizedCount = results.filter((r) => r.status === 401).length;

    expect(successCount).toBe(1);
    expect(unauthorizedCount).toBe(concurrency - 1);
    },
    { timeout: 10_000 },
  );
});
