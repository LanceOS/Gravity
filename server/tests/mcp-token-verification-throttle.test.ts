import { describe, expect, it, vi } from 'vitest';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { createConnectionToken } from '../src/modules/mcp/connection.js';

describe('MCP bearer verification throttle', () => {
  it('counts malformed bearer headers, blocks at the default threshold, and emits a safe alert', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ownerApi = await createAuthenticatedApi({ name: 'Throttle owner', email: 'throttle-owner@example.com' });
    const { workspace } = await seedWorkspaceFixture({ owner: ownerApi.user });
    const first = await api().post('/api/v1/mcp')
      .set('Authorization', 'Bearer')
      .set('X-Forwarded-For', '198.51.100.1')
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 0, method: 'tools/list' });
    expect(first.status).toBe(401);
    const token = await createConnectionToken({ workspaceId: workspace.id, generatedBy: ownerApi.user.id });
    const valid = await api().post('/api/v1/mcp')
      .set('Authorization', `Bearer ${token.rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(valid.status).toBe(200);
    for (let attempt = 1; attempt < 10; attempt++) {
      const response = await api().post('/api/v1/mcp')
        .set('Authorization', 'Bearer')
        .set('X-Forwarded-For', `198.51.100.${attempt + 1}`)
        .set('X-Workspace-Id', workspace.id)
        .send({ jsonrpc: '2.0', id: attempt + 1, method: 'tools/list' });
      expect(response.status).toBe(401);
    }
    const blocked = await api().post('/api/v1/mcp')
      .set('Authorization', 'Bearer')
      .set('X-Forwarded-For', '198.51.100.250')
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 11, method: 'tools/list' });
    expect(blocked.status).toBe(429);
    const alerts = errors.mock.calls.map(([message]) => String(message))
      .filter(message => message.includes('security.mcp_token_verification_failures'));
    expect(alerts).toHaveLength(1);
    expect(JSON.parse(alerts[0])).toMatchObject({ securityAlert: true, count: 10, threshold: 10, windowMs: 60_000 });
    expect(alerts[0]).not.toContain(workspace.id);
    expect(alerts[0]).not.toContain(token.rawToken);
    expect(alerts[0]).not.toContain('198.51.100');
    expect(alerts[0]).not.toMatch(/127\.0\.0\.1|::1/);
  });
});
