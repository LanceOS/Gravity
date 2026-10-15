import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const manifests = ['docker-compose.yml', 'docker/docker-compose.yml', 'server/docker-compose.yml'];
const secrets = {
  GRAVITY_POSTGRES_PASSWORD: 'a1b2c3d4e5f60123456789abcdef0123',
  GRAVITY_REDIS_PASSWORD: 'fedcba9876543210fedcba9876543210',
  BETTER_AUTH_SECRET: '0123456789abcdef0123456789abcdef',
  NODE_IDENTITY_MASTER_KEY: 'abcdef0123456789abcdef0123456789',
  RUSTFS_SECRET_KEY: '13579bdf2468ace013579bdf2468ace0',
};

const composeAvailable = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0;

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'gravity-compose-config-'));
  for (const manifest of manifests) {
    const target = join(directory, manifest);
    mkdirSync(resolve(target, '..'), { recursive: true });
    copyFileSync(join(root, manifest), target);
  }
  return directory;
}

function compose(directory, manifest, envFile) {
  const env = { ...process.env };
  for (const key of [...Object.keys(secrets), 'NODE_ENV', 'GRAVITY_BIND_ADDRESS',
    'GRAVITY_POSTGRES_USER', 'GRAVITY_POSTGRES_DB']) delete env[key];
  return spawnSync('docker', ['compose', '--env-file', envFile, '-f', join(directory, manifest),
    'config', '--format', 'json'], {
    cwd: directory,
    encoding: 'utf8',
    env,
  });
}

test('fresh Compose manifests reject missing required secrets', { skip: !composeAvailable }, () => {
  const directory = fixture();
  try {
    for (const manifest of manifests) {
      const result = compose(directory, manifest, '/dev/null');
      assert.notEqual(result.status, 0, manifest);
      assert.match(result.stderr, /GRAVITY_POSTGRES_PASSWORD/);
      assert.match(result.stderr, /GRAVITY_REDIS_PASSWORD/);
      assert.match(result.stderr, /RUSTFS_SECRET_KEY/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('custom passwords align Redis service, healthcheck, and backend URL', { skip: !composeAvailable }, () => {
  const directory = fixture();
  try {
    const envFile = join(directory, '.env');
    writeFileSync(envFile, Object.entries({ ...secrets, NODE_ENV: 'production' })
      .map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
    for (const manifest of manifests) {
      const result = compose(directory, manifest, envFile);
      assert.equal(result.status, 0, `${manifest}: ${result.stderr}`);
      const { services } = JSON.parse(result.stdout);
      assert.equal(services.postgres.environment.POSTGRES_PASSWORD, secrets.GRAVITY_POSTGRES_PASSWORD);
      assert.equal(services.postgres.environment.NODE_ENV, 'production');
      assert.equal(services.redis.environment.GRAVITY_REDIS_PASSWORD, secrets.GRAVITY_REDIS_PASSWORD);
      assert.equal(services.redis.environment.NODE_ENV, 'production');
      assert.match(services.redis.healthcheck.test.join(' '), /REDISCLI_AUTH=.*GRAVITY_REDIS_PASSWORD/);
      if (services.backend) {
        assert.equal(services.backend.environment.REDIS_URL,
          `redis://default:${secrets.GRAVITY_REDIS_PASSWORD}@redis:6379`);
        assert.equal(services.backend.environment.DATABASE_URL,
          `postgresql://gravity_user:${secrets.GRAVITY_POSTGRES_PASSWORD}@postgres:5432/gravity_workspace`);
        assert.equal(services.backend.environment.RUSTFS_SECRET_KEY, secrets.RUSTFS_SECRET_KEY);
      }
      for (const service of Object.values(services)) {
        for (const port of service.ports ?? []) assert.equal(port.host_ip, '127.0.0.1');
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('service entrypoint rejects weak production passwords but allows a generated value', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gravity-compose-secret-test-'));
  try {
    writeFileSync(join(temp, 'docker-entrypoint.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const run = (service, password, nodeEnv = 'production') => spawnSync('sh',
      [join(root, 'scripts/docker/start-service.sh'), service], {
        encoding: 'utf8',
        env: { PATH: `${temp}:${process.env.PATH}`, NODE_ENV: nodeEnv,
          POSTGRES_PASSWORD: password, GRAVITY_REDIS_PASSWORD: password },
      });
    for (const service of ['postgres', 'redis']) {
      assert.notEqual(run(service, '').status, 0);
      assert.notEqual(run(service, 'password').status, 0);
      assert.notEqual(run(service, 'placeholder0123456789abcdef01234567').status, 0);
    }
    assert.equal(run('postgres', secrets.GRAVITY_POSTGRES_PASSWORD).status, 0);
    assert.equal(run('postgres', 'local-only-password', 'development').status, 0);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
