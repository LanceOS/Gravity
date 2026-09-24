import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../src/env.js';
import { isMcpOAuthEnabled, OAUTH_DISABLED_MESSAGE } from '../src/modules/mcp/oauth.js';
import { api, seedWorkspaceFixture } from './helpers/test-helpers.js';

const originalBaseUrl = env.betterAuthBaseUrl;
afterEach(() => { env.betterAuthBaseUrl = originalBaseUrl; });

describe('OAuth issuer availability', () => {
  it.each(['https://gravity.example', 'https://[::1]:8443', 'http://localhost:9999', 'http://127.0.0.1:9999'])(
    'supports secure or SDK-supported local origins: %s', baseUrl => {
      expect(isMcpOAuthEnabled(baseUrl)).toBe(true);
    },
  );

  it.each(['http://192.168.1.50:9999', 'http://gravity.lan', 'http://[::1]:9999', 'ftp://localhost', 'invalid'])(
    'keeps OAuth disabled for unsupported origins: %s', baseUrl => {
      expect(isMcpOAuthEnabled(baseUrl)).toBe(false);
    },
  );

  it('starts on a private HTTP host and preserves health and manual MCP while clearly disabling OAuth', async () => {
    env.betterAuthBaseUrl = 'http://192.168.1.50:9999';
    const { workspace, owner } = await seedWorkspaceFixture();
    const health = await api().get('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const setup = await api().get(`/api/v1/workspaces/${workspace.id}/mcp/setup`).set('x-user-id', owner.id);
    expect(setup.status).toBe(200);
    expect(setup.body).toEqual({
      mcpEndpoint: `${env.betterAuthBaseUrl}/api/v1/workspaces/${workspace.id}/mcp`,
      oauthEnabled: false, message: OAUTH_DISABLED_MESSAGE,
    });
    expect((await api().get('/.well-known/oauth-authorization-server')).status).toBe(404);
    expect((await api().get(`/.well-known/oauth-protected-resource/api/v1/workspaces/${workspace.id}/mcp`)).status).toBe(404);
    expect((await api().post('/register').send({})).status).toBe(404);
    const unavailable = await api().post(`/api/v1/workspaces/${workspace.id}/mcp`).send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers['www-authenticate']).toBeUndefined();

    const issued = await api().post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).set('x-user-id', owner.id)
      .send({ scopes: ['tools/list', 'tools/call:get_workspace'] });
    expect(issued.status).toBe(201);
    const manual = await api().post('/api/v1/mcp').set('Authorization', `Bearer ${issued.body.auth.token}`)
      .set('X-Workspace-Id', workspace.id).send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(manual.status).toBe(200);
    expect(manual.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['get_workspace']);
  });

  it.each(['https://gravity.example', 'http://localhost:9999'])('still exposes OAuth metadata when enabled: %s', async baseUrl => {
    env.betterAuthBaseUrl = baseUrl;
    const metadata = await api().get('/.well-known/oauth-authorization-server');
    expect(metadata.status).toBe(200);
    expect(metadata.body.issuer).toBe(`${baseUrl}/`);
    expect(metadata.body.code_challenge_methods_supported).toEqual(['S256']);
  });
});
