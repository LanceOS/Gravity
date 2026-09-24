import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { mcpConnectionTokens, mcpOAuthRequests, mcpOAuthRefreshTokens, mcpOAuthGrants, workspaceMembers, workspaces } from '../src/db/schema.js';
import { env } from '../src/env.js';
import { refreshConnectionToken, verifyAndConsumeToken } from '../src/modules/mcp/connection.js';
import { api, createAuthenticatedApi } from './helpers/test-helpers.js';

const origin = new URL(env.betterAuthBaseUrl).origin;
const redirectUri = 'https://example.com/oauth/callback';
const scopes = ['tools/list', 'tools/call:get_workspace'];
const hash = (input: string) => createHash('sha256').update(input).digest('base64url');
const endpoint = '/api/v1/workspaces/oauth-workspace/mcp';
const resource = `${origin}${endpoint}`;

async function fixture() {
  const account = await createAuthenticatedApi({ email: `oauth-${randomBytes(5).toString('hex')}@example.com` });
  await db.insert(workspaces).values({ id: 'oauth-workspace', name: 'OAuth workspace', key: 'OAUTH', workspaceKey: 'private-key', createdBy: account.user.id });
  return account;
}
async function register(extra = {}) {
  const response = await api().post('/register').send({ client_name: 'OAuth test client', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', ...extra });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body;
}
async function authorize(clientId: string, extra = {}) {
  const verifier = randomBytes(32).toString('base64url');
  const response = await api().get('/authorize').query({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    code_challenge: hash(verifier), code_challenge_method: 'S256', state: 'round-trip', resource, scope: scopes.join(' '), ...extra });
  expect(response.status, JSON.stringify(response.body)).toBe(302);
  const destination = new URL(response.headers.location);
  const requestId = destination.searchParams.get('request');
  expect(destination.pathname).toBe('/oauth/consent');
  expect(requestId).toBeTruthy();
  return { requestId: requestId!, verifier };
}
async function consent(account: Awaited<ReturnType<typeof fixture>>, requestId: string, requestedScopes = scopes) {
  const path = `/api/v1/mcp/oauth/requests/${requestId}`;
  expect((await account.get(path)).status).toBe(200);
  const response = await account.post(path).set('Origin', origin).send({ approved: true, scopes: requestedScopes });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const callback = new URL(response.body.redirectUrl);
  expect(callback.searchParams.get('state')).toBe('round-trip');
  return callback.searchParams.get('code')!;
}
function exchange(clientId: string, code: string, verifier: string, extra = {}) {
  return api().post('/token').type('form').send({ grant_type: 'authorization_code', client_id: clientId,
    code, code_verifier: verifier, redirect_uri: redirectUri, resource, ...extra });
}
function refresh(clientId: string, refreshToken: string, extra = {}) {
  return api().post('/token').type('form').send({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken, resource, ...extra });
}
function call(token?: string, path = endpoint) {
  const request = api().post(path).send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  return token ? request.set('Authorization', `Bearer ${token}`) : request;
}

async function grant() {
  const account = await fixture();
  const client = await register();
  const request = await authorize(client.client_id);
  const code = await consent(account, request.requestId);
  const response = await exchange(client.client_id, code, request.verifier);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return { account, client, request, code, tokens: response.body };
}

describe('workspace OAuth MCP authorization', () => {
  it('discovers a workspace-bound resource and registers only public PKCE clients', async () => {
    const account = await fixture();
    const setup = await account.get('/api/v1/workspaces/oauth-workspace/mcp/setup');
    expect(setup.body).toEqual({ mcpEndpoint: resource, oauthEnabled: true });
    const unauthenticated = await call();
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['www-authenticate']).toContain(`resource_metadata="${origin}/.well-known/oauth-protected-resource${endpoint}"`);
    expect((await account.post(endpoint).send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(401);
    const metadata = await api().get(`/.well-known/oauth-protected-resource${endpoint}`);
    expect(metadata.body.resource).toBe(resource);
    const authorizationMetadata = await api().get('/.well-known/oauth-authorization-server');
    expect(authorizationMetadata.body.token_endpoint_auth_methods_supported).toEqual(['none']);
    const client = await register({ token_endpoint_auth_method: undefined });
    expect(client.token_endpoint_auth_method).toBe('none');
    expect(client).not.toHaveProperty('client_secret');
    expect((await api().post('/register').send({ redirect_uris: [redirectUri], token_endpoint_auth_method: 'client_secret_post' })).status).toBe(400);
    expect((await api().post('/register').send({ redirect_uris: ['http://example.com/cb'], token_endpoint_auth_method: 'none' })).status).toBe(400);
  });

  it('requires a real session, exact Origin, and session-bound explicit consent', async () => {
    const account = await fixture();
    const second = await createAuthenticatedApi({ email: 'oauth-other@example.com' });
    await db.insert(workspaceMembers).values({ workspaceId: 'oauth-workspace', userId: second.user.id, role: 'admin' });
    const client = await register();
    const request = await authorize(client.client_id);
    const path = `/api/v1/mcp/oauth/requests/${request.requestId}`;
    expect((await api().get(path).set('x-user-id', account.user.id)).status).toBe(401);
    const details = await account.get(path);
    expect(details.body).toMatchObject({ workspace: { id: 'oauth-workspace', name: 'OAuth workspace' }, grantTtlSeconds: 2592000, accessTokenTtlSeconds: 3600 });
    expect(details.body.tools.map((tool: { name: string }) => tool.name)).toEqual(['get_workspace']);
    expect((await second.get(path)).status).toBe(409);
    expect((await second.post(path).set('Origin', origin).send({ approved: true, scopes })).status).toBe(409);
    expect((await account.post(path).send({ approved: true, scopes })).status).toBe(403);
    expect((await account.post(path).set('Origin', 'https://evil.example').set('Authorization', 'anything').send({ approved: true, scopes })).status).toBe(403);
    expect((await account.post(path).set('Origin', origin).send({ approved: true, scopes: ['tools/call:update_ticket'] })).status).toBe(403);
    const approved = await account.post(path).set('Origin', origin).send({ approved: true, scopes });
    expect(approved.status).toBe(200);
    expect((await account.post(path).set('Origin', origin).send({ approved: true, scopes })).status).toBe(409);
    const expired = await authorize(client.client_id);
    await db.update(mcpOAuthRequests).set({ expiresAt: new Date(0) }).where(eq(mcpOAuthRequests.id, expired.requestId));
    expect((await account.get(`/api/v1/mcp/oauth/requests/${expired.requestId}`)).status).toBe(409);
  });

  it('binds codes to PKCE, client, redirect and resource, consumes once, and exposes only selected tools', async () => {
    const account = await fixture();
    const client = await register();
    const otherClient = await register();
    const request = await authorize(client.client_id);
    const code = await consent(account, request.requestId);
    expect((await exchange(client.client_id, code, 'wrong-verifier')).status).toBe(400);
    expect((await exchange(otherClient.client_id, code, request.verifier)).status).toBe(400);
    expect((await exchange(client.client_id, code, request.verifier, { redirect_uri: 'https://example.com/wrong' })).status).toBe(400);
    expect((await exchange(client.client_id, code, request.verifier, { resource: `${origin}/api/v1/workspaces/other/mcp` })).status).toBe(400);
    const token = await exchange(client.client_id, code, request.verifier);
    expect(token.status, JSON.stringify(token.body)).toBe(200);
    expect((await exchange(client.client_id, code, request.verifier)).status).toBe(400);
    const listed = await call(token.body.access_token);
    expect(listed.status).toBe(200);
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['get_workspace']);
    expect(listed.body.result.tools[0].securitySchemes).toEqual([{ type: 'oauth2', scopes: ['tools/call:get_workspace'] }]);
    expect((await call(token.body.access_token)).status).toBe(200);
    expect((await call(token.body.access_token, '/api/v1/workspaces/other/mcp')).status).toBe(401);
    expect(await verifyAndConsumeToken(token.body.access_token, 'oauth-workspace')).toBeNull();
    const read = await api().post(endpoint).set('Authorization', `Bearer ${token.body.access_token}`).send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_workspace', arguments: {} } });
    expect(read.body.result.isError).not.toBe(true);
    const inventory = await account.get('/api/v1/users/me/mcp/connections');
    expect(inventory.body).toHaveLength(1);
    expect(inventory.body[0]).toMatchObject({ connectionType: 'oauth', clientName: 'OAuth test client', scopes });
    expect(await refreshConnectionToken(inventory.body[0].id, account.user.id)).toBeNull();
    const [row] = await db.select().from(mcpConnectionTokens);
    expect(row.tokenHash).not.toBe(token.body.access_token);
    const [refreshRow] = await db.select().from(mcpOAuthRefreshTokens);
    expect(refreshRow.tokenHash).not.toBe(token.body.refresh_token);
  });

  it('rotates refresh tokens without extending the grant and revokes the family on replay', async () => {
    const { client, tokens } = await grant();
    const otherClient = await register();
    const [before] = await db.select().from(mcpConnectionTokens);
    expect((await refresh(otherClient.client_id, tokens.refresh_token)).status).toBe(400);
    expect((await refresh(client.client_id, tokens.refresh_token, { resource: `${origin}/api/v1/workspaces/other/mcp` })).status).toBe(400);
    expect((await refresh(client.client_id, tokens.refresh_token, { scope: 'tools/call:update_ticket' })).status).toBe(400);
    const rotated = await refresh(client.client_id, tokens.refresh_token);
    expect(rotated.status, JSON.stringify(rotated.body)).toBe(200);
    expect(rotated.body.refresh_token).not.toBe(tokens.refresh_token);
    expect((await call(tokens.access_token)).status).toBe(401);
    expect((await call(rotated.body.access_token)).status).toBe(200);
    const [after] = await db.select().from(mcpConnectionTokens);
    expect(after.expiresAt).toEqual(before.expiresAt);
    expect((await refresh(client.client_id, tokens.refresh_token)).status).toBe(400);
    expect((await call(rotated.body.access_token)).status).toBe(401);
    expect((await refresh(client.client_id, rotated.body.refresh_token)).status).toBe(400);
  });

  it('enforces current workspace access and shared account revocation on access and refresh', async () => {
    const { account, client, tokens } = await grant();
    await db.update(workspaces).set({ createdBy: 'another-owner' }).where(eq(workspaces.id, 'oauth-workspace'));
    expect((await call(tokens.access_token)).status).toBe(401);
    expect((await refresh(client.client_id, tokens.refresh_token)).status).toBe(400);
    await db.insert(workspaceMembers).values({ workspaceId: 'oauth-workspace', userId: account.user.id, role: 'member' });
    const renewed = await refresh(client.client_id, tokens.refresh_token);
    expect(renewed.status).toBe(200);
    const [connection] = await db.select().from(mcpConnectionTokens);
    const revoked = await account.post(`/api/v1/workspaces/oauth-workspace/mcp/connection/${connection.id}/revoke`).send({});
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(200);
    expect((await call(renewed.body.access_token)).status).toBe(401);
    expect((await refresh(client.client_id, renewed.body.refresh_token)).status).toBe(400);
  });

  it('supports explicit denial and expires codes, access tokens, and the fixed grant', async () => {
    const account = await fixture();
    const client = await register();
    const denied = await authorize(client.client_id);
    const deniedPath = `/api/v1/mcp/oauth/requests/${denied.requestId}`;
    await account.get(deniedPath);
    const denial = await account.post(deniedPath).set('Origin', origin).send({ approved: false });
    expect(new URL(denial.body.redirectUrl).searchParams.get('error')).toBe('access_denied');
    expect(await db.select().from(mcpConnectionTokens)).toHaveLength(0);
    const expired = await authorize(client.client_id);
    const expiredCode = await consent(account, expired.requestId);
    await db.update(mcpOAuthRequests).set({ codeExpiresAt: new Date(0) }).where(eq(mcpOAuthRequests.id, expired.requestId));
    expect((await exchange(client.client_id, expiredCode, expired.verifier)).status).toBe(400);
    const fresh = await authorize(client.client_id);
    const freshCode = await consent(account, fresh.requestId);
    const tokens = (await exchange(client.client_id, freshCode, fresh.verifier)).body;
    const [connection] = await db.select().from(mcpConnectionTokens);
    await db.update(mcpOAuthGrants).set({ accessExpiresAt: new Date(0) }).where(eq(mcpOAuthGrants.connectionId, connection.id));
    expect((await call(tokens.access_token)).status).toBe(401);
    const renewed = await refresh(client.client_id, tokens.refresh_token);
    expect(renewed.status).toBe(200);
    await db.update(mcpConnectionTokens).set({ expiresAt: new Date(0) }).where(eq(mcpConnectionTokens.id, connection.id));
    expect((await call(renewed.body.access_token)).status).toBe(401);
    expect((await refresh(client.client_id, renewed.body.refresh_token)).status).toBe(400);
  });

  it('removes write permissions from consent after demotion and rejects previously granted writes', async () => {
    const account = await fixture();
    const client = await register();
    const writeScopes = [...scopes, 'tools/call:set_ticket_status'];
    const request = await authorize(client.client_id, { scope: writeScopes.join(' ') });
    const code = await consent(account, request.requestId, writeScopes);
    const tokens = (await exchange(client.client_id, code, request.verifier)).body;
    await db.update(workspaces).set({ createdBy: 'different-owner' }).where(eq(workspaces.id, 'oauth-workspace'));
    await db.insert(workspaceMembers).values({ workspaceId: 'oauth-workspace', userId: account.user.id, role: 'member' });
    expect((await refresh(client.client_id, tokens.refresh_token)).status).toBe(400);
    const write = await api().post(endpoint).set('Authorization', `Bearer ${tokens.access_token}`).send({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'set_ticket_status', arguments: { ticketKey: 'MISSING-1', status: 'done' } },
    });
    expect(write.body.error?.code, JSON.stringify(write.body)).toBe(-32001);
    expect(write.body.error.message).toContain('owner or admin');
    const nextRequest = await authorize(client.client_id, { scope: writeScopes.join(' ') });
    const path = `/api/v1/mcp/oauth/requests/${nextRequest.requestId}`;
    const details = await account.get(path);
    expect(details.body.tools.map((tool: { name: string }) => tool.name)).toEqual(['get_workspace']);
    expect((await account.post(path).set('Origin', origin).send({ approved: true, scopes: writeScopes })).status).toBe(403);
  });

});
