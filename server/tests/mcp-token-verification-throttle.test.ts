import { describe, expect, it, vi } from 'vitest';
import { api } from './helpers/test-helpers.js';

describe('MCP bearer verification throttle', () => {
  it('counts malformed bearer headers, blocks at the default threshold, and emits a safe alert', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await api().post('/api/v1/mcp')
        .set('Authorization', 'Bearer')
        .set('X-Workspace-Id', 'untrusted-workspace')
        .send({ jsonrpc: '2.0', id: attempt, method: 'tools/list' });
      expect(response.status).toBe(401);
    }
    const blocked = await api().post('/api/v1/mcp')
      .set('Authorization', 'Bearer')
      .set('X-Workspace-Id', 'untrusted-workspace')
      .send({ jsonrpc: '2.0', id: 11, method: 'tools/list' });
    expect(blocked.status).toBe(429);
    const alerts = errors.mock.calls.map(([message]) => String(message))
      .filter(message => message.includes('security.mcp_token_verification_failures'));
    expect(alerts).toHaveLength(1);
    expect(JSON.parse(alerts[0])).toMatchObject({ securityAlert: true, count: 10, threshold: 10, windowMs: 60_000 });
    expect(alerts[0]).not.toContain('untrusted-workspace');
    expect(alerts[0]).not.toMatch(/127\.0\.0\.1|::1/);
  });
});
