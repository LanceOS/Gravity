import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  initialized: true, shuttingDown: false, version: 1, schemaReady: true,
  postgres: true, storage: true, redis: true, rateLimiting: true,
  query: vi.fn(), send: vi.fn(), ping: vi.fn(),
}));
vi.mock('../src/env.js', () => ({ env: { databaseUrl: 'mock', objectStorageRequired: true,
  redisRequired: true, redisEnabled: true, rustfsBucket: 'test' } }));
vi.mock('../src/lib/rateLimitRedis.js', () => ({ isRedisRateLimitingHealthy: () => state.rateLimiting }));
vi.mock('pg', () => ({ Pool: class { query = state.query; on() {} } }));
vi.mock('@aws-sdk/client-s3', () => ({ S3Client: class { send = state.send; },
  HeadBucketCommand: class {}, CreateBucketCommand: class {} }));
vi.mock('../src/lib/redis.js', () => ({ client: { get isReady() { return state.redis; }, ping: state.ping } }));
vi.mock('../src/lib/server-lifecycle.js', () => ({
  isServerInitialized: () => state.initialized, isServerShuttingDown: () => state.shuttingDown,
}));
const { checkReadiness } = await import('../src/lib/dependency-readiness.js');
beforeEach(() => {
  state.rateLimiting = true;
  state.initialized = state.postgres = state.storage = state.redis = state.schemaReady = true;
  state.shuttingDown = false; state.version = 1;
  state.query.mockReset().mockImplementation(async (sql: string) => {
    if (!state.postgres) throw new Error('database credentials');
    return { rows: sql.includes('version') ? [{ version: state.version, ready: state.schemaReady }] : [] };
  });
  state.send.mockReset().mockImplementation(async () => { if (!state.storage) throw new Error('storage credentials'); });
  state.ping.mockReset().mockResolvedValue('PONG');
});
it.each(['postgres', 'storage', 'redis'] as const)('detects required %s loss and recovery', async dependency => {
  expect((await checkReadiness()).status).toBe('ok');
  state[dependency] = false;
  const result = await checkReadiness();
  expect(result.status).toBe('unavailable');
  expect(JSON.stringify(result)).not.toContain('credentials');
  state[dependency] = true;
  expect((await checkReadiness()).status).toBe('ok');
});
it('rejects wrong, incomplete and missing schema versions', async () => {
  state.version = 0;
  expect((await checkReadiness()).checks.schema.status).toBe('unavailable');
  state.version = 1; state.schemaReady = false;
  expect((await checkReadiness()).status).toBe('unavailable');
  state.schemaReady = true;
  state.query.mockResolvedValue({ rows: [] });
  expect((await checkReadiness()).status).toBe('unavailable');
});
it('skips dependency calls during migration and detects shutdown during probes', async () => {
  state.initialized = false;
  expect((await checkReadiness()).status).toBe('unavailable');
  expect(state.query).not.toHaveBeenCalled();
  state.initialized = true;
  state.ping.mockImplementation(async () => { state.shuttingDown = true; return 'PONG'; });
  expect((await checkReadiness()).status).toBe('unavailable');
});

it('reports command-specific limiter degradation even when Redis PING succeeds', async () => {
  state.rateLimiting = false;
  const result = await checkReadiness();
  expect(result.status).toBe('degraded');
  expect(result.checks.redis.status).toBe('ok');
  expect(result.checks.rateLimiting.status).toBe('unavailable');
  state.rateLimiting = true;
  expect((await checkReadiness()).status).toBe('ok');
});
