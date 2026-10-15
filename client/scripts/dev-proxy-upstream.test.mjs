import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';
import { resolveDevProxyUpstream } from '../dev-proxy-upstream.ts';
import { validateViteEnvironment } from '../vite-env.ts';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(clientRoot, '..');

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
  assert.equal(resolveDevProxyUpstream({
    BACKEND_UPSTREAM: 'http://backend:8080',
    GRAVITY_DEV_PROXY_ALLOWED_ORIGINS: 'http://backend:8080',
  }), 'http://backend:8080');
  assert.equal(resolveDevProxyUpstream({
    BACKEND_UPSTREAM: 'https://dev-api.example.test:443/',
    GRAVITY_DEV_PROXY_ALLOWED_ORIGINS: 'https://dev-api.example.test',
  }), 'https://dev-api.example.test');
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

test('permits only reviewed VITE_ browser variables', () => {
  assert.doesNotThrow(() => validateViteEnvironment({
    VITE_ALLOWED_HOSTS: 'app.example.test',
    VITE_ALLOWED_TICKET_HOSTS: 'tickets.example.test',
    VITE_FRONTEND_PUBLIC_URL: 'https://app.example.test',
    VITE_TICKET_URL_BASE: 'https://tickets.example.test',
  }));
  assert.throws(() => validateViteEnvironment({ VITE_PRIVATE_TOKEN: 'do-not-bundle' }), /VITE_PRIVATE_TOKEN is not an approved browser environment variable/);
  assert.throws(() => validateViteEnvironment({ VITE_API_PROXY_TARGET: 'https://private.example.test' }), /VITE_API_PROXY_TARGET is no longer supported/);
});

async function withProxyEnv(values, run) {
  const keys = ['BACKEND_UPSTREAM', 'GRAVITY_DEV_PROXY_ALLOWED_ORIGINS', 'VITE_API_PROXY_TARGET', 'VITE_PRIVATE_TOKEN'];
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
    assert.equal(loaded.config.server?.proxy, undefined);
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

test('production build config rejects an unreviewed browser variable', async () => {
  await withProxyEnv({ VITE_PRIVATE_TOKEN: 'do-not-bundle' }, async () => {
    await assert.rejects(
      loadConfigFromFile({ command: 'build', mode: 'production' }, resolve(clientRoot, 'vite.config.ts'), clientRoot),
      /VITE_PRIVATE_TOKEN is not an approved browser environment variable/,
    );
  });
});

test('Vite config reads client env files when loaded from the repository root', async () => {
  const mode = `grav-23-${randomUUID()}`;
  const envFile = resolve(clientRoot, `.env.${mode}`);
  const previousCwd = process.cwd();
  await writeFile(envFile, 'BACKEND_UPSTREAM=http://127.0.0.1:8080\n', { flag: 'wx' });
  try {
    await withProxyEnv({}, async () => {
      process.chdir(repoRoot);
      const loaded = await loadConfigFromFile({ command: 'serve', mode }, resolve(clientRoot, 'vite.config.ts'), repoRoot);
      assert.equal(loaded?.config.root, clientRoot);
      assert.equal(loaded?.config.envDir, clientRoot);
      assert.equal(loaded?.config.server?.proxy?.['^/api(?:/|\\?|$)']?.target, 'http://127.0.0.1:8080');
    });
  } finally {
    process.chdir(previousCwd);
    await rm(envFile);
  }
});
