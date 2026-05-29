import { describe, it, expect, afterEach, vi } from 'vitest';

import { db } from '../../src/db/index.js';
import { mcpConnectionTokens } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

// Helpers are in tests/helpers
import { api as publicApi, createAuthenticatedApi, seedWorkspaceFixture, resetTestApp } from '../helpers/test-helpers.js';

describe('MCP connection advanced flows', () => {
  afterEach(async () => {
    // Keep env clean between tests that mutate it and ensure DB schema
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_OLD_SECRETS;
    await resetTestApp();
  });

  it('increments usageCount for multi-use tokens and keeps status active', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Multi Use Owner',
      email: `multi-owner+${Date.now()}@example.com`,
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const createRes = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({ singleUse: false });
    expect(createRes.status).toBe(201);
    const rawToken = createRes.body.auth.token;

    // Use twice (multi-use)
    const use1 = await publicApi()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect(use1.status).toBe(200);

    const use2 = await publicApi()
      .post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    expect(use2.status).toBe(200);

    const rows = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, createRes.body.id)).limit(1);
    const row = rows[0];
    expect(row).toBeTruthy();
    expect(Number(row.usageCount)).toBe(2);
    expect(row.status).toBe('active');
  });

  it('verifies a token created under an old HMAC secret (key rotation)', async () => {
    const oldSecret = `old-secret-${Date.now()}`;
    const newSecret = `new-secret-${Date.now()}`;

    // Create token while BETTER_AUTH_SECRET == oldSecret
    process.env.BETTER_AUTH_SECRET = oldSecret;
    vi.resetModules();
    // After resetting modules, ensure the in-memory DB schema exists again
    const { initializeDatabase } = await import('../../src/db/bootstrap.js');
    await initializeDatabase();
    const helpers = await import('../helpers/test-helpers.js');
    const connModule = await import('../../src/modules/mcp/connection.js');

    const ownerApi = await helpers.createAuthenticatedApi({
      name: 'HMAC Owner',
      email: `hmac-owner+${Date.now()}@example.com`,
      role: 'owner',
    });
    const owner = ownerApi.user;
    const { workspace } = await helpers.seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const tokenPayload = await connModule.createConnectionToken({ workspaceId: workspace.id, generatedBy: owner.id });
    expect(tokenPayload).toBeTruthy();
    const rawToken = tokenPayload.rawToken;

    // Rotate secrets: new secret is current, old secret must be listed in BETTER_AUTH_OLD_SECRETS
    process.env.BETTER_AUTH_SECRET = newSecret;
    process.env.BETTER_AUTH_OLD_SECRETS = oldSecret;
    // Mutate runtime env so existing modules pick up rotated keys without resetting DB
    helpers.setSecretsForTest({ betterAuthSecret: newSecret, betterAuthOldSecrets: [oldSecret] });

    const verified = await connModule.verifyAndConsumeToken(rawToken, workspace.id);
    expect(verified).toBeTruthy();
  });

  it('enforces sourceIp binding when token has a sourceIp', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Source IP Owner',
      email: `source-owner+${Date.now()}@example.com`,
      role: 'owner',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar },
    });

    const conn = await import('../../src/modules/mcp/connection.js');
    // Create a multi-use token bound to specific source IP
    const payload = await conn.createConnectionToken({ workspaceId: workspace.id, generatedBy: owner.id, singleUse: false, sourceIp: '1.2.3.4' });
    const rawToken = payload.rawToken;

    // Correct IP should verify
    const good = await conn.verifyAndConsumeToken(rawToken, workspace.id, { sourceIp: '1.2.3.4' });
    expect(good).toBeTruthy();

    // Wrong IP should be rejected
    const bad = await conn.verifyAndConsumeToken(rawToken, workspace.id, { sourceIp: '5.6.7.8' });
    expect(bad).toBeNull();
  });
});

export {};
