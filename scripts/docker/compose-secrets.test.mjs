import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const manifests = ['docker-compose.yml', 'docker/docker-compose.yml', 'server/docker-compose.yml'];
const secretKeys = ['GRAVITY_POSTGRES_PASSWORD', 'GRAVITY_REDIS_PASSWORD',
  'BETTER_AUTH_SECRET', 'NODE_IDENTITY_MASTER_KEY', 'RUSTFS_SECRET_KEY'];
const secrets = Object.fromEntries(secretKeys.map(key => [key, randomBytes(32).toString('hex')]));
const requiredKeys = manifest => manifest === 'server/docker-compose.yml'
  ? ['GRAVITY_POSTGRES_PASSWORD', 'GRAVITY_REDIS_PASSWORD', 'RUSTFS_SECRET_KEY']
  : secretKeys;

const composeAvailable = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0;

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'gravity-compose-config-'));
  for (const manifest of manifests) {
    const target = join(directory, manifest);
    mkdirSync(resolve(target, '..'), { recursive: true });
    copyFileSync(join(root, manifest), target);
  }
  copyFileSync(join(root, 'docker-compose.dev.yml'), join(directory, 'docker-compose.dev.yml'));
  mkdirSync(join(directory, 'scripts/docker'), { recursive: true });
  copyFileSync(join(root, 'scripts/docker/start-service.sh'),
    join(directory, 'scripts/docker/start-service.sh'));
  return directory;
}

function compose(directory, manifest, envFile, overrides = {}, extraFiles = []) {
  const env = { ...process.env };
  for (const key of [...Object.keys(secrets), 'NODE_ENV', 'GRAVITY_BIND_ADDRESS',
    'GRAVITY_POSTGRES_USER', 'GRAVITY_POSTGRES_DB', 'RUSTFS_ACCESS_KEY',
    'GITHUB_WEBHOOK_SECRET', 'BETTER_AUTH_BASE_URL', 'CORS_ORIGINS',
    'TRUSTED_ORIGINS']) delete env[key];
  Object.assign(env, overrides);
  return spawnSync('docker', ['compose', '--env-file', envFile, '-f', join(directory, manifest),
    ...extraFiles.flatMap(file => ['-f', join(directory, file)]), 'config', '--format', 'json'], {
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
      if (manifest !== 'server/docker-compose.yml') {
        assert.match(result.stderr, /BETTER_AUTH_SECRET/);
        assert.match(result.stderr, /NODE_IDENTITY_MASTER_KEY/);
      }
      for (const key of requiredKeys(manifest)) {
        const envFile = join(directory, '.env');
        writeFileSync(envFile, Object.entries({ ...secrets, [key]: '' })
          .map(([name, value]) => `${name}=${value}`).join('\n') + '\n', { mode: 0o600 });
        const empty = compose(directory, manifest, envFile);
        assert.notEqual(empty.status, 0, `${manifest} accepted empty ${key}`);
        assert.match(empty.stderr, new RegExp(key));
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('development override keeps custom secrets and local mode', { skip: !composeAvailable }, () => {
  const directory = fixture();
  try {
    const missing = compose(directory, 'docker-compose.yml', '/dev/null', {}, ['docker-compose.dev.yml']);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /GRAVITY_REDIS_PASSWORD/);

    const envFile = join(directory, '.env');
    writeFileSync(envFile, Object.entries({ ...secrets, NODE_ENV: 'development',
      LOCAL_TESTING_KEK: randomBytes(32).toString('hex') })
      .map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
    const configured = compose(directory, 'docker-compose.yml', envFile, {}, ['docker-compose.dev.yml']);
    assert.equal(configured.status, 0, configured.stderr);
    const { services } = JSON.parse(configured.stdout);
    for (const name of ['postgres', 'redis', 'rustfs', 'backend']) {
      assert.equal(services[name].environment.NODE_ENV, 'development');
    }
    assert.equal(services.redis.environment.GRAVITY_REDIS_PASSWORD, secrets.GRAVITY_REDIS_PASSWORD);
    assert.equal(services.backend.environment.REDIS_URL,
      `redis://default:${secrets.GRAVITY_REDIS_PASSWORD}@redis:6379`);
    assert.equal(services.backend.environment.ENCRYPTED_CREDENTIALS_MODE, 'required');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('environment-only secrets work for infrastructure Compose; app Compose requires .env',
  { skip: !composeAvailable }, () => {
    const directory = fixture();
    try {
      for (const manifest of manifests) {
        const result = compose(directory, manifest, '/dev/null', secrets);
        if (manifest === 'server/docker-compose.yml') {
          assert.equal(result.status, 0, `${manifest}: ${result.stderr}`);
          const { services } = JSON.parse(result.stdout);
          for (const service of Object.values(services)) {
            assert.equal(service.environment.NODE_ENV, 'production');
          }
        } else {
          assert.notEqual(result.status, 0, `${manifest} unexpectedly ignored missing .env`);
          assert.match(result.stderr, /env file .*\.env not found/);
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

test('unset NODE_ENV defaults every Compose service to production', { skip: !composeAvailable }, () => {
  const directory = fixture();
  try {
    const envFile = join(directory, '.env');
    writeFileSync(envFile, Object.entries(secrets)
      .map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
    for (const manifest of manifests) {
      const result = compose(directory, manifest, envFile);
      assert.equal(result.status, 0, `${manifest}: ${result.stderr}`);
      const { services } = JSON.parse(result.stdout);
      for (const name of ['postgres', 'redis', 'rustfs', 'backend']) {
        if (services[name]) assert.equal(services[name].environment.NODE_ENV, 'production');
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('custom passwords align Redis service, healthcheck, and backend URL', { skip: !composeAvailable }, () => {
  const directory = fixture();
  try {
    const envFile = join(directory, '.env');
    writeFileSync(envFile, Object.entries({ ...secrets, NODE_ENV: 'production',
      RUSTFS_ACCESS_KEY: 'gravityoperator',
      GITHUB_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_BASE_URL: 'https://gravity.example.com',
      CORS_ORIGINS: 'https://gravity.example.com',
      TRUSTED_ORIGINS: 'https://gravity.example.com' })
      .map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
    for (const manifest of manifests) {
      const result = compose(directory, manifest, envFile);
      assert.equal(result.status, 0, `${manifest}: ${result.stderr}`);
      const { services } = JSON.parse(result.stdout);
      assert.equal(services.postgres.environment.POSTGRES_PASSWORD, secrets.GRAVITY_POSTGRES_PASSWORD);
      assert.equal(services.postgres.environment.NODE_ENV, 'production');
      assert.equal(services.redis.environment.GRAVITY_REDIS_PASSWORD, secrets.GRAVITY_REDIS_PASSWORD);
      assert.equal(services.redis.environment.NODE_ENV, 'production');
      assert.equal(services.rustfs.environment.RUSTFS_SECRET_KEY, secrets.RUSTFS_SECRET_KEY);
      assert.equal(services.rustfs.environment.NODE_ENV, 'production');
      assert.equal(services.rustfs.environment.BETTER_AUTH_SECRET, undefined);
      assert.equal(services.rustfs.environment.NODE_IDENTITY_MASTER_KEY, undefined);
      assert.equal(services.rustfs.environment.GRAVITY_POSTGRES_PASSWORD, undefined);
      assert.equal(services.rustfs.environment.GRAVITY_REDIS_PASSWORD, undefined);
      assert.deepEqual(services.rustfs.entrypoint,
        ['/bin/sh', '/usr/local/bin/gravity-start-service', 'rustfs']);
      assert.deepEqual(services.rustfs.command, ['/data/rustfs', '--console-enable']);

      const redisCli = join(directory, 'redis-cli');
      writeFileSync(redisCli, '#!/bin/sh\n[ "$REDISCLI_AUTH" = "$GRAVITY_REDIS_PASSWORD" ] || exit 1\nprintf "PONG\\n"\n', { mode: 0o755 });
      // `compose config` retains escaped dollars; Compose unescapes them when
      // it creates the Docker healthcheck command.
      const healthcheckShell = services.redis.healthcheck.test[1].replaceAll('$$', '$');
      const healthcheck = spawnSync('sh', ['-ec', healthcheckShell], {
        encoding: 'utf8',
        env: { PATH: `${directory}:${process.env.PATH}`,
          GRAVITY_REDIS_PASSWORD: secrets.GRAVITY_REDIS_PASSWORD },
      });
      assert.equal(healthcheck.status, 0, `${manifest} Redis healthcheck failed`);
      assert.equal(healthcheck.stdout.trim(), 'PONG');
      if (services.backend) {
        assert.equal(services.backend.depends_on.rustfs.condition, 'service_healthy');
        assert.equal(services.backend.environment.REDIS_URL,
          `redis://default:${secrets.GRAVITY_REDIS_PASSWORD}@redis:6379`);
        assert.equal(services.backend.environment.DATABASE_URL,
          `postgresql://gravity_user:${secrets.GRAVITY_POSTGRES_PASSWORD}@postgres:5432/gravity_workspace`);
        assert.equal(services.backend.environment.RUSTFS_SECRET_KEY, secrets.RUSTFS_SECRET_KEY);
        assert.equal(services.backend.environment.BETTER_AUTH_SECRET, secrets.BETTER_AUTH_SECRET);
        assert.equal(services.backend.environment.NODE_IDENTITY_MASTER_KEY,
          secrets.NODE_IDENTITY_MASTER_KEY);
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
        env: { PATH: `${temp}:${process.env.PATH}`,
          ...(nodeEnv === null ? {} : { NODE_ENV: nodeEnv }),
          POSTGRES_PASSWORD: password, GRAVITY_REDIS_PASSWORD: password,
          RUSTFS_SECRET_KEY: password },
      });
    for (const service of ['postgres', 'redis', 'rustfs']) {
      assert.match(run(service, '').stderr, /must be set to a nonempty value/);
      assert.match(run(service, 'password').stderr, /known or placeholder secret/);
      assert.match(run(service, 'placeholder0123456789abcdef01234567').stderr,
        /known or placeholder secret/);
      assert.match(run(service, '0123456789abcdef'.repeat(4)).stderr,
        /known or placeholder secret/);
      assert.match(run(service, 'shortKey9', null).stderr, /at least 32 characters/);
      assert.match(run(service, 'a'.repeat(64)).stderr, /at least eight distinct characters/);
      assert.match(run(service, secrets.GRAVITY_POSTGRES_PASSWORD, 'prod').stderr,
        /NODE_ENV must be development, test, or production/);
    }
    assert.match(run('postgres', 'local key with spaces', 'development').stderr,
      /URL-safe letters/);
    assert.equal(run('postgres', secrets.GRAVITY_POSTGRES_PASSWORD).status, 0);
    assert.equal(run('postgres', 'localKey9', 'development').status, 0);
    assert.equal(run('postgres', 'localKey9', 'test').status, 0);
    for (let i = 0; i < 64; i++) {
      assert.equal(run('postgres', randomBytes(32).toString('hex')).status, 0);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
