import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';
import { resolveDevProxyUpstream } from '../dev-proxy-upstream.ts';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('accepts the local default and loopback backend origins', () => {
  assert.equal(resolveDevProxyUpstream({}), 'http://localhost:8080');
  for (const origin of ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://[::1]:8080']) {
    assert.equal(resolveDevProxyUpstream({ BACKEND_UPSTREAM: origin }), origin);
  }
});

test('accepts an explicitly approved exact origin', () => {
  assert.equal(resolveDevProxyUpstream({
    BACKEND_UPSTREAM: 'https://dev-api.example.test:8443/',
    GRAVITY_DEV_PROXY_ALLOWED_ORIGINS: 'http://backend:8080, https://dev-api.example.test:8443',
  }), 'https://dev-api.example.test:8443');
});

test('rejects unapproved, malformed, or credential-bearing upstreams', () => {
  for (const value of [
    'https://dev-api.example.test',
    'http://localhost:8081',
    'http://evil.example',
    'ftp://localhost:8080',
    'http://user:secret@localhost:8080',
    'http://localhost:8080/api',
    'http://localhost:8080?token=secret',
    'http://localhost:8080/#fragment',
    'http://localhost:8080/api/..',
    'not-a-url',
  ]) {
    assert.throws(() => resolveDevProxyUpstream({ BACKEND_UPSTREAM: value }), /BACKEND_UPSTREAM/, value);
  }
});

test('rejects invalid allowlist entries and the browser-exposed legacy setting', () => {
  for (const value of ['*', 'https://user:secret@dev-api.example.test', 'https://dev-api.example.test/path', 'https://dev-api.example.test,']) {
    assert.throws(() => resolveDevProxyUpstream({ GRAVITY_DEV_PROXY_ALLOWED_ORIGINS: value }), /GRAVITY_DEV_PROXY_ALLOWED_ORIGINS/, value);
  }
  assert.throws(() => resolveDevProxyUpstream({ VITE_API_PROXY_TARGET: 'http://localhost:8080' }), /VITE_API_PROXY_TARGET/);
});

async function withProxyEnv(values, run) {
  const keys = ['BACKEND_UPSTREAM', 'GRAVITY_DEV_PROXY_ALLOWED_ORIGINS', 'VITE_API_PROXY_TARGET'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    await run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('Vite config uses an explicitly approved proxy upstream', async () => {
  await withProxyEnv({
    BACKEND_UPSTREAM: 'https://dev-api.example.test:8443',
    GRAVITY_DEV_PROXY_ALLOWED_ORIGINS: 'https://dev-api.example.test:8443',
  }, async () => {
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, resolve(clientRoot, 'vite.config.ts'), clientRoot);
    assert.ok(loaded?.config.server?.proxy);
    for (const options of Object.values(loaded.config.server.proxy)) {
      assert.equal(options.target, 'https://dev-api.example.test:8443');
    }
  });
});

test('Vite config fails at startup for an unapproved proxy upstream', async () => {
  await withProxyEnv({ BACKEND_UPSTREAM: 'https://unapproved.example.test' }, async () => {
    await assert.rejects(
      loadConfigFromFile({ command: 'serve', mode: 'test' }, resolve(clientRoot, 'vite.config.ts'), clientRoot),
      /BACKEND_UPSTREAM is not an allowed dev proxy origin/,
    );
  });
});

test('production build config does not apply the dev proxy allowlist', async () => {
  await withProxyEnv({ BACKEND_UPSTREAM: 'https://production-api.example.test' }, async () => {
    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve(clientRoot, 'vite.config.ts'), clientRoot);
    assert.ok(loaded?.config);
  });
});

test('production build config rejects the browser-exposed legacy proxy target', async () => {
  await withProxyEnv({ VITE_API_PROXY_TARGET: 'https://private-api.example.test' }, async () => {
    await assert.rejects(
      loadConfigFromFile({ command: 'build', mode: 'production' }, resolve(clientRoot, 'vite.config.ts'), clientRoot),
      /VITE_API_PROXY_TARGET is no longer supported/,
    );
  });
});
