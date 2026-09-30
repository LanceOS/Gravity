import { describe, expect, it } from 'vitest';
import { parseDeploymentConfig } from '../src/config.js';
import { allowLocalWebhookBypass } from '../src/lib/local-webhook-bypass.js';

const valid = {
  NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:secret@postgres/gravity',
  BETTER_AUTH_SECRET: '51d9cf4b3aa779d4e4b16a0ec3490492b565f273a398ff53a99b37b98b0b378e',
  NODE_IDENTITY_MASTER_KEY: 'ccbd521907f0d990ad21459f7b5309f087898a45acb81c25ea4a3f3457e17b113',
  LOCAL_TESTING_KEK: 'af9c5bd2bc0a4193dad476d1489f108721086194417d433275ab3a166957a916',
  GITHUB_WEBHOOK_SECRET: 'a92c3a59d51b3acf493d4153b09eb618f8f13c96cc4a7f12486398949062005b',
  BETTER_AUTH_BASE_URL: 'https://gravity.example.org',
  CORS_ORIGINS: 'https://gravity.example.org', TRUSTED_ORIGINS: 'https://gravity.example.org',
  RUSTFS_SECRET_KEY: '587efda91ef2e0ae6d33e4f91a0409e8',
};

describe('deployment configuration boundary', () => {
  it('accepts a complete production deployment without network access', () => {
    expect(parseDeploymentConfig(valid).ALLOW_UNSIGNED_LOCAL_WEBHOOKS).toBe(false);
  });
  it('lists missing fields without echoing supplied secrets', () => {
    expect(() => parseDeploymentConfig({ BETTER_AUTH_SECRET: 'do-not-print-me' })).toThrow(/DATABASE_URL/);
    try { parseDeploymentConfig({ BETTER_AUTH_SECRET: 'do-not-print-me' }); } catch (error) {
      expect(String(error)).toContain('NODE_IDENTITY_MASTER_KEY');
      expect(String(error)).not.toContain('do-not-print-me');
    }
  });
  it.each(['test-secret', 'change-me-please-change-me-please-123456', '0123456789abcdef'.repeat(4), 'x'.repeat(64)])('rejects placeholder %s', secret => {
    expect(() => parseDeploymentConfig({ ...valid, BETTER_AUTH_SECRET: secret })).toThrow(/BETTER_AUTH_SECRET/);
  });
  it.each(['ftp://example.org', 'https://user:pass@example.org', 'https://example.org/path', 'https://*.example.org', 'http://example.org', 'https://localhost', 'https://127.0.0.2', 'https://[::ffff:127.0.0.1]', 'https://example.org?q=1', 'https://example.org#fragment'])('rejects unsafe production origin %s', origin => {
    expect(() => parseDeploymentConfig({ ...valid, BETTER_AUTH_BASE_URL: origin, CORS_ORIGINS: origin, TRUSTED_ORIGINS: origin })).toThrow(/BETTER_AUTH_BASE_URL/);
  });
  it.each(['BETTER_AUTH_BASE_URL', 'CORS_ORIGINS', 'TRUSTED_ORIGINS', 'GITHUB_WEBHOOK_SECRET'])('requires %s in production', key => {
    expect(() => parseDeploymentConfig({ ...valid, [key]: undefined })).toThrow(new RegExp(key));
  });
  it('requires the local KMS key only in environments that use it', () => {
    expect(parseDeploymentConfig({ ...valid, LOCAL_TESTING_KEK: undefined })).toBeDefined();
    expect(() => parseDeploymentConfig({ ...valid, NODE_ENV: 'development', LOCAL_TESTING_KEK: undefined })).toThrow(/LOCAL_TESTING_KEK/);
    expect(() => parseDeploymentConfig({ ...valid, NODE_ENV: 'test', LOCAL_TESTING_KEK: '' })).toThrow(/LOCAL_TESTING_KEK/);
  });
  it('normalizes equivalent origins to the browser Origin header form', () => {
    const config = parseDeploymentConfig({ ...valid, CORS_ORIGINS: 'https://GRAVITY.example.org:443/', TRUSTED_ORIGINS: 'https://gravity.example.org/', BETTER_AUTH_BASE_URL: 'https://gravity.example.org/' });
    expect(config.CORS_ORIGINS).toBe('https://gravity.example.org');
    expect(config.TRUSTED_ORIGINS).toBe(config.CORS_ORIGINS);
    expect(config.BETTER_AUTH_BASE_URL).toBe(config.CORS_ORIGINS);
  });
  it.each(['https:example.org', 'https://example.org/#', 'https://example.org/?', 'https://example.org/foo/..', 'https://example.org/../', 'https://localHOST.'])('rejects non-origin URL syntax %s', origin => {
    expect(() => parseDeploymentConfig({ ...valid, CORS_ORIGINS: origin })).toThrow(/CORS_ORIGINS/);
  });
  it('validates KMS format and required dependency settings', () => {
    expect(() => parseDeploymentConfig({ ...valid, NODE_ENV: 'development', LOCAL_TESTING_KEK: 'invalid', REDIS_REQUIRED: 'true', DATABASE_URL: 'sqlite://file' })).toThrow(/LOCAL_TESTING_KEK[\s\S]*DATABASE_URL[\s\S]*REDIS_REQUIRED/);
    expect(() => parseDeploymentConfig({ ...valid, REDIS_ENABLED: 'true', REDIS_URL: 'http://redis' })).toThrow(/REDIS_URL/);
    expect(() => parseDeploymentConfig({ ...valid, RUSTFS_ENDPOINT: 'file:///tmp/storage' })).toThrow(/RUSTFS_ENDPOINT/);
  });
  it('validates proxy CIDRs and rejects malformed booleans', () => {
    expect(parseDeploymentConfig({ ...valid, TRUSTED_PROXIES: '127.0.0.1,10.0.0.0/8,::1' })).toBeDefined();
    for (const proxy of ['0.0.0.0/99', 'fe80::1%eth0', '::ffff:127.0.0.1/32']) {
      expect(() => parseDeploymentConfig({ ...valid, TRUSTED_PROXIES: proxy })).toThrow(/TRUSTED_PROXIES/);
    }
    expect(() => parseDeploymentConfig({ ...valid, ALLOW_UNSIGNED_LOCAL_WEBHOOKS: 'yes' })).toThrow(/ALLOW_UNSIGNED_LOCAL_WEBHOOKS/);
    expect(() => parseDeploymentConfig({ ...valid, ALLOW_UNSIGNED_LOCAL_WEBHOOKS: 'true' })).toThrow(/ALLOW_UNSIGNED_LOCAL_WEBHOOKS/);
  });
  it('supports explicit local-test configuration while leaving bypass off by default', () => {
    const local = { ...valid, NODE_ENV: 'test', DATABASE_URL: 'pgmem://gravity', BETTER_AUTH_BASE_URL: 'http://localhost:8080', GITHUB_WEBHOOK_SECRET: undefined };
    expect(parseDeploymentConfig(local).ALLOW_UNSIGNED_LOCAL_WEBHOOKS).toBe(false);
    expect(parseDeploymentConfig({ ...local, ALLOW_UNSIGNED_LOCAL_WEBHOOKS: 'true' }).ALLOW_UNSIGNED_LOCAL_WEBHOOKS).toBe(true);
  });
});

describe('unsigned webhook loopback policy', () => {
  it.each(['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1'])('permits explicitly opted-in direct loopback %s', ip => {
    expect(allowLocalWebhookBypass(true, 'development', ip)).toBe(true);
  });
  it.each(['10.0.0.1', '172.17.0.1', '192.168.1.1', '::ffff:10.0.0.1', undefined, 'localhost'])('denies non-loopback %s', ip => {
    expect(allowLocalWebhookBypass(true, 'development', ip)).toBe(false);
  });
  it('denies production, default mode, and forwarding headers', () => {
    expect(allowLocalWebhookBypass(true, 'production', '127.0.0.1')).toBe(false);
    expect(allowLocalWebhookBypass(false, 'development', '127.0.0.1')).toBe(false);
    expect(allowLocalWebhookBypass(true, 'test', '127.0.0.1', true)).toBe(false);
  });
});
