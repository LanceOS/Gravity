import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/env.js';
import { parseDeploymentConfig } from '../../src/config.js';
import { setSecretsForTest } from '../helpers/test-helpers.js';
import { testSecrets } from '../helpers/test-secrets.js';

afterEach(() => vi.unstubAllEnvs());

describe('test secret isolation', () => {
  it.each([undefined, '', 'caller-rotated-secret', ' old=caller-secret , older:other-secret '])(
    'restores exact caller values (%j), independently of parsed runtime secrets', (previous) => {
      vi.stubEnv('BETTER_AUTH_SECRET', previous);
      vi.stubEnv('BETTER_AUTH_OLD_SECRETS', previous);
      const runtime = {
        current: env.betterAuthSecret,
        old: [...env.betterAuthOldSecrets],
        map: { ...env.betterAuthOldSecretsMap },
      };
      const restoreOuter = setSecretsForTest({
        betterAuthSecret: 'outer-test-secret',
        betterAuthOldSecrets: ['outer=old-test-secret'],
        betterAuthOldSecretsMap: { outer: 'old-test-secret' },
      });
      try {
        const restoreInner = setSecretsForTest({ betterAuthSecret: 'inner-test-secret', betterAuthOldSecrets: [] });
        try {
          expect(process.env.BETTER_AUTH_SECRET).toBe('inner-test-secret');
        } finally {
          restoreInner();
        }
        expect(process.env.BETTER_AUTH_SECRET).toBe('outer-test-secret');
        expect(process.env.BETTER_AUTH_OLD_SECRETS).toBe('outer=old-test-secret');
      } finally {
        restoreOuter();
      }
      expect(process.env.BETTER_AUTH_SECRET).toBe(previous);
      expect(process.env.BETTER_AUTH_OLD_SECRETS).toBe(previous);
      expect(env.betterAuthSecret).toBe(runtime.current);
      expect(env.betterAuthOldSecrets).toEqual(runtime.old);
      expect(env.betterAuthOldSecretsMap).toEqual(runtime.map);
    },
  );

  it('provides all required secrets without reading the parent environment', () => {
    expect(() => parseDeploymentConfig({
      ...testSecrets, NODE_ENV: 'test', DATABASE_URL: 'pgmem://secret-fixture',
    })).not.toThrow();
    expect(() => parseDeploymentConfig({
      ...testSecrets, NODE_ENV: 'production', DATABASE_URL: 'postgresql://unused/unused',
    })).toThrow(/BETTER_AUTH_SECRET[\s\S]*NODE_IDENTITY_MASTER_KEY/);
  });
});
