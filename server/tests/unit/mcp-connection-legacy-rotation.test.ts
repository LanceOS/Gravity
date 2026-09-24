import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConnectionToken, verifyAndConsumeToken } from '../../src/modules/mcp/connection.js';

describe('MCP legacy HMAC secret rotation', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['padded base64', Buffer.alloc(64, 42).toString('base64')],
    ['colon', 'legacy:synthetic-secret'],
    ['equals', 'legacy=synthetic-secret'],
  ])('retains an unkeyed %s secret in a mixed rotation list', async (_name, oldSecret) => {
    vi.stubEnv('BETTER_AUTH_SECRET', oldSecret);
    vi.stubEnv('BETTER_AUTH_OLD_SECRETS', '');
    const token = await createConnectionToken({ workspaceId: 'rotation-workspace', generatedBy: 'rotation-user' });

    vi.stubEnv('BETTER_AUTH_SECRET', 'new-synthetic-secret');
    expect(await verifyAndConsumeToken(token.rawToken, 'rotation-workspace')).toBeNull();

    vi.stubEnv('BETTER_AUTH_OLD_SECRETS', `other=other-synthetic-secret,${oldSecret},older:another-synthetic-secret`);
    expect(await verifyAndConsumeToken(token.rawToken, 'rotation-workspace')).toMatchObject({ id: token.id });
  });

  it('requires the original explicit key mapping even when its raw secret is retained', async () => {
    const oldSecret = Buffer.alloc(64, 41).toString('base64');
    vi.stubEnv('BETTER_AUTH_SECRET', 'current-synthetic-secret');
    vi.stubEnv('BETTER_AUTH_OLD_SECRETS', `old=${oldSecret}`);
    const token = await createConnectionToken({
      workspaceId: 'rotation-workspace', generatedBy: 'rotation-user', hmacKeyId: 'old',
    });

    vi.stubEnv('BETTER_AUTH_OLD_SECRETS', oldSecret);
    expect(await verifyAndConsumeToken(token.rawToken, 'rotation-workspace')).toBeNull();

    vi.stubEnv('BETTER_AUTH_OLD_SECRETS', `old=wrong-synthetic-secret,${oldSecret}`);
    expect(await verifyAndConsumeToken(token.rawToken, 'rotation-workspace')).toBeNull();

    vi.stubEnv('BETTER_AUTH_OLD_SECRETS', `old=${oldSecret},${oldSecret}`);
    expect(await verifyAndConsumeToken(token.rawToken, 'rotation-workspace')).toMatchObject({ id: token.id });
  });
});
