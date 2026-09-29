import { afterEach, expect, it, vi } from 'vitest';
import { createReadinessCheck } from '../src/lib/readiness.js';
import { createHealthRouter } from '../src/modules/health/routes.js';
import { requireInitializedServer } from '../src/lib/admission.js';
import { beginServerInitialization, completeServerInitialization, beginServerShutdown } from '../src/lib/server-lifecycle.js';

const lifecycle = vi.hoisted(() => ({ initialized: false, shuttingDown: false }));
vi.mock('../src/lib/server-lifecycle.js', () => ({
  isServerInitialized: () => lifecycle.initialized,
  isServerShuttingDown: () => lifecycle.shuttingDown,
  beginServerInitialization: () => { lifecycle.initialized = false; },
  completeServerInitialization: () => { lifecycle.initialized = true; },
  beginServerShutdown: () => { lifecycle.shuttingDown = true; },
}));
afterEach(() => { vi.useRealTimers(); lifecycle.initialized = false; lifecycle.shuttingDown = false; });

it('reports required dependency loss and recovery, and optional degradation without secrets', async () => {
  let database = true;
  let redis = true;
  const check = createReadinessCheck({
    postgres: { required: true, check: async () => database },
    redis: { required: false, check: async () => { if (!redis) throw new Error('secret://password'); return true; } },
  });
  expect((await check()).status).toBe('ok');
  redis = false;
  expect((await check()).status).toBe('degraded');
  expect(JSON.stringify(await check())).not.toContain('password');
  database = false;
  expect((await check()).status).toBe('unavailable');
  database = redis = true;
  expect((await check()).status).toBe('ok');
});

it('bounds hung probes, aborts I/O and does not accumulate outstanding work', async () => {
  vi.useFakeTimers();
  let resolve!: (ready: boolean) => void;
  let signal!: AbortSignal;
  const probe = vi.fn((abort: AbortSignal) => { signal = abort; return new Promise<boolean>(r => { resolve = r; }); });
  const check = createReadinessCheck({ storage: { required: true, check: probe } }, 50);
  const first = check();
  await vi.advanceTimersByTimeAsync(50);
  expect((await first).status).toBe('unavailable');
  expect(signal.aborted).toBe(true);
  const second = check();
  await vi.advanceTimersByTimeAsync(50);
  expect((await second).status).toBe('unavailable');
  expect(probe).toHaveBeenCalledTimes(1);
  resolve(true);
  await Promise.resolve(); await Promise.resolve();
  probe.mockImplementation(async () => true);
  expect((await check()).status).toBe('ok');
});

function response() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}
it('rejects application traffic before initialization, on migration restart and during shutdown', () => {
  const next = vi.fn();
  const res = response();
  requireInitializedServer({} as never, res as never, next);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(next).not.toHaveBeenCalled();
  completeServerInitialization();
  requireInitializedServer({} as never, res as never, next);
  expect(next).toHaveBeenCalledTimes(1);
  beginServerInitialization();
  requireInitializedServer({} as never, res as never, next);
  expect(next).toHaveBeenCalledTimes(1);
  completeServerInitialization(); beginServerShutdown();
  requireInitializedServer({} as never, res as never, next);
  expect(next).toHaveBeenCalledTimes(1);
});

it('keeps liveness independent and maps unavailable/degraded readiness to 503/200', async () => {
  const check = vi.fn(async () => ({ status: 'unavailable' as 'unavailable' | 'degraded', checks: {} }));
  const router = createHealthRouter(check);
  const live = router.stack[0].route.stack[0].handle;
  const ready = router.stack[1].route.stack[0].handle;
  const res = response();
  live({}, res);
  expect(res.json).toHaveBeenCalledWith({ status: 'ok', service: 'gravity-server' });
  expect(check).not.toHaveBeenCalled();
  await ready({}, res);
  expect(res.status).toHaveBeenLastCalledWith(503);
  check.mockResolvedValue({ status: 'degraded', checks: {} });
  await ready({}, res);
  expect(res.status).toHaveBeenLastCalledWith(200);
});

it('publishes the schema version only after migrations succeed; failures stay unready', async () => {
  const { initializeSchema, REQUIRED_SCHEMA_VERSION } = await import('../src/db/schema-version.js');
  const query = vi.fn(async () => ({ rows: [] }));
  const pool = { query } as never;
  const migrate = vi.fn(async () => {
    expect(lifecycle.initialized).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('ready = false');
  });
  await initializeSchema(pool, migrate);
  expect(lifecycle.initialized).toBe(true);
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining('ready = true'), [REQUIRED_SCHEMA_VERSION]);
  query.mockClear();
  await expect(initializeSchema(pool, async () => { throw new Error('migration failed'); })).rejects.toThrow('migration failed');
  expect(query).toHaveBeenCalledTimes(2);
  expect(lifecycle.initialized).toBe(false);
});
