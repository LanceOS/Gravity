import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetTestApp } from './helpers/test-helpers.js';

describe('MCP HMAC key-id rotation (keyed secrets)', () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    await resetTestApp();
  });

  it('accepts tokens created with a keyed old secret when the key-id mapping is retained', async () => {
    const oldKeyId = 'old1';
    const oldSecret = `old-secret-${Date.now()}`;
    const newSecret = `new-secret-${Date.now()}`;

    // Prepare environment so the keyed old secret is known at creation time
    vi.stubEnv('BETTER_AUTH_SECRET', newSecret);
    vi.stubEnv('BETTER_AUTH_OLD_SECRETS', `${oldKeyId}=${oldSecret}`);
    await resetTestApp();
    const helpers = await import('./helpers/test-helpers.js');
    const connModule = await import('../src/modules/mcp/connection.js');

    const ownerApi = await helpers.createAuthenticatedApi({ name: 'Keyed Owner', email: `keyed-owner+${Date.now()}@example.com`, role: 'owner' });
    const owner = ownerApi.user;
    const { workspace } = await helpers.seedWorkspaceFixture({ owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar } });

    // Create a token explicitly using the keyed old secret id
    const payload = await connModule.createConnectionToken({ workspaceId: workspace.id, generatedBy: owner.id, hmacKeyId: oldKeyId });
    expect(payload).toBeTruthy();
    const rawToken = payload.rawToken;

    // Simulate rotation: new secret becomes current, but we retain the keyed mapping to the old secret
    vi.stubEnv('BETTER_AUTH_SECRET', newSecret + '-rotated');

    const verified = await connModule.verifyAndConsumeToken(rawToken, workspace.id);
    expect(verified).toBeTruthy();
  });

  it('rejects keyed-old-token when keyed mapping is not retained', async () => {
    const oldKeyId = 'old2';
    const oldSecret = `old-secret-${Date.now()}`;

    vi.stubEnv('BETTER_AUTH_SECRET', oldSecret);
    vi.stubEnv('BETTER_AUTH_OLD_SECRETS', `${oldKeyId}=${oldSecret}`);
    await resetTestApp();
    const helpers = await import('./helpers/test-helpers.js');
    const connModule = await import('../src/modules/mcp/connection.js');

    const ownerApi = await helpers.createAuthenticatedApi({ name: 'Keyed Owner 2', email: `keyed-owner2+${Date.now()}@example.com`, role: 'owner' });
    const owner = ownerApi.user;
    const { workspace } = await helpers.seedWorkspaceFixture({ owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, avatarUrl: owner.avatar } });

    const payload = await connModule.createConnectionToken({ workspaceId: workspace.id, generatedBy: owner.id, hmacKeyId: oldKeyId });
    expect(payload).toBeTruthy();
    const rawToken = payload.rawToken;

    // Now simulate rotation where the keyed mapping is NOT retained
    vi.stubEnv('BETTER_AUTH_SECRET', 'some-new-secret');
    vi.stubEnv('BETTER_AUTH_OLD_SECRETS', '');

    const verified = await connModule.verifyAndConsumeToken(rawToken, workspace.id);
    // Should be rejected because the keyed mapping no longer exists
    expect(verified).toBeNull();
  });
});

export {};
