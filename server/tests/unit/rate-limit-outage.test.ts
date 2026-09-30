import type { NextFunction, Request, Response } from 'express';
import type { RedisClientType } from 'redis';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/env.js', () => ({ env: { trustedProxies: [] } }));
vi.mock('../../src/lib/redis.js', () => ({ client: null }));
let createRedisRateLimiter: typeof import('../../src/lib/rateLimitRedis.js').createRedisRateLimiter;
let isRedisRateLimitingHealthy: typeof import('../../src/lib/rateLimitRedis.js').isRedisRateLimitingHealthy;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ createRedisRateLimiter, isRedisRateLimitingHealthy } = await import('../../src/lib/rateLimitRedis.js'));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const defaults = { namespace: 'test', failurePolicy: 'local' as const, windowMs: 5000, max: 2, client: null };
async function invoke(limiter: ReturnType<typeof createRedisRateLimiter>, ip = '192.0.2.1') {
  const res = { statusCode: 200, headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; }, json: vi.fn(),
    setHeader(name: string, value: string) { this.headers[name] = value; } };
  const next = vi.fn();
  await limiter({ socket: { remoteAddress: ip } } as Request, res as unknown as Response, next as NextFunction);
  return { ...res, next };
}
it.each([null, { isOpen: false, isReady: false }, { isOpen: true, isReady: false }])('caps unavailable Redis (%j)', async client => {
  const limiter = createRedisRateLimiter({ ...defaults, client: client as RedisClientType | null });
  expect((await invoke(limiter)).next).toHaveBeenCalledOnce();
  expect((await invoke(limiter)).next).toHaveBeenCalledOnce();
  const denied = await invoke(limiter);
  expect(denied.statusCode).toBe(429);
  expect(denied.headers['Retry-After']).toBe('5');
  expect(denied.next).not.toHaveBeenCalled();
  expect(isRedisRateLimitingHealthy()).toBe(false);
  expect(console.warn).toHaveBeenCalledTimes(1);
});
it('shares fallback capacity across concurrent middleware instances but isolates policies and identities', async () => {
  const instances = Array.from({ length: 20 }, () => createRedisRateLimiter(defaults));
  const responses = await Promise.all(instances.map(limiter => invoke(limiter)));
  expect(responses.filter(r => r.next.mock.calls.length)).toHaveLength(2);
  expect(responses.filter(r => r.statusCode === 429)).toHaveLength(18);
  expect((await invoke(instances[0], '192.0.2.2')).next).toHaveBeenCalledOnce();
  expect((await invoke(createRedisRateLimiter({ ...defaults, namespace: 'other' }))).next).toHaveBeenCalledOnce();
});
it('applies both outage policies on command rejection and malformed replies', async () => {
  const evalCommand = vi.fn().mockRejectedValue(new Error('sensitive details'));
  const client = { isOpen: true, isReady: true, eval: evalCommand } as unknown as RedisClientType;
  const local = createRedisRateLimiter({ ...defaults, client, max: 1 });
  const closed = createRedisRateLimiter({ ...defaults, namespace: 'closed', client, failurePolicy: 'closed' });
  expect((await invoke(local)).next).toHaveBeenCalledOnce();
  expect((await invoke(local)).statusCode).toBe(429);
  expect((await invoke(closed)).statusCode).toBe(503);
  evalCommand.mockResolvedValue(null);
  expect((await invoke(closed)).statusCode).toBe(503);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('sensitive details');
});
it('recovers on successful commands including denials, preserves budgets across flaps, and expires local state', async () => {
  const client = { isOpen: true, isReady: false, eval: vi.fn().mockResolvedValue([0, 1, 1000]) };
  const limiter = createRedisRateLimiter({ ...defaults, max: 1, client: client as unknown as RedisClientType });
  await invoke(limiter);
  client.isReady = true;
  expect((await invoke(limiter)).statusCode).toBe(429);
  expect(isRedisRateLimitingHealthy()).toBe(true);
  client.isReady = false;
  expect((await invoke(limiter)).statusCode).toBe(429);
  expect(console.warn).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect((await invoke(limiter)).next).toHaveBeenCalledOnce();
  client.isReady = true;
  client.eval.mockResolvedValue([1, 1, 0]);
  expect((await invoke(limiter)).next).toHaveBeenCalledOnce();
  expect(isRedisRateLimitingHealthy()).toBe(true);
});
it('hard caps unique fallback keys without evicting live budgets, then reclaims expired keys', async () => {
  const limiter = createRedisRateLimiter({ ...defaults, max: 1, keyFn: req => req.headers['x-test-key'] as string });
  const call = async (key: string) => {
    let status = 200;
    let admitted = false;
    const res = { status(code: number) { status = code; return this; }, json() {}, setHeader() {} };
    await limiter({ headers: { 'x-test-key': key } } as Request, res as unknown as Response, () => { admitted = true; });
    return { status, admitted };
  };
  let admitted = 0;
  for (let i = 0; i < 10_000; i++) if ((await call(String(i))).admitted) admitted++;
  expect(admitted).toBe(10_000);
  expect((await call('overflow')).status).toBe(503);
  expect((await call('0')).status).toBe(429);
  await vi.advanceTimersByTimeAsync(60_000);
  expect((await call('overflow')).admitted).toBe(true);
});
it('never calls next if an asynchronous identity resolver rejects', async () => {
  const limiter = createRedisRateLimiter({ ...defaults, keyFn: async () => { throw new Error('identity failed'); } });
  const response = await invoke(limiter);
  expect(response.statusCode).toBe(503);
  expect(response.next).not.toHaveBeenCalled();
});

it('enforces shared Redis capacity across independent process stores and clients', async () => {
  const replicaA = createRedisRateLimiter;
  vi.resetModules();
  const replicaB = (await import('../../src/lib/rateLimitRedis.js')).createRedisRateLimiter;
  const counts = new Map<string, number>();
  const evalCommand = async (_script: string, options: { keys: string[] }) => {
    const count = counts.get(options.keys[0]) ?? 0;
    if (count >= 2) return [0, count, 5000];
    counts.set(options.keys[0], count + 1);
    return [1, count + 1, 0];
  };
  const clientA = { isOpen: true, isReady: true, eval: evalCommand } as unknown as RedisClientType;
  const clientB = { isOpen: true, isReady: true, eval: evalCommand } as unknown as RedisClientType;
  const a = replicaA({ ...defaults, client: clientA });
  const b = replicaB({ ...defaults, client: clientB });
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => invoke(i % 2 ? a : b)));
  expect(responses.filter(r => r.statusCode === 200)).toHaveLength(2);
  expect(responses.filter(r => r.statusCode === 429)).toHaveLength(18);
  expect(counts.size).toBe(1);
  // With no distributed store, each replica has its own explicitly local budget.
  clientA.isReady = clientB.isReady = false;
  expect((await invoke(a)).next).toHaveBeenCalledOnce();
  expect((await invoke(b)).next).toHaveBeenCalledOnce();
  expect((await invoke(a)).next).toHaveBeenCalledOnce();
  expect((await invoke(b)).next).toHaveBeenCalledOnce();
  expect((await invoke(a)).statusCode).toBe(429);
  expect((await invoke(b)).statusCode).toBe(429);
  for (const factory of [replicaA, replicaB]) {
    expect((await invoke(factory({ ...defaults, failurePolicy: 'closed' }))).statusCode).toBe(503);
  }
});

it.each(['local', 'closed'] as const)('bounds stalled EVAL work for %s and ignores late replies', async failurePolicy => {
  let resolve!: (result: number[]) => void;
  const evalCommand = vi.fn().mockImplementationOnce(() => new Promise<number[]>(done => { resolve = done; }))
    .mockResolvedValue([1, 1, 0]);
  const client = { isOpen: true, isReady: true, eval: evalCommand } as unknown as RedisClientType;
  const limiter = createRedisRateLimiter({ ...defaults, max: 1, failurePolicy, client });
  const pending = invoke(limiter);
  await vi.advanceTimersByTimeAsync(1000);
  const first = await pending;
  expect(first.statusCode).toBe(failurePolicy === 'local' ? 200 : 503);
  expect(isRedisRateLimitingHealthy()).toBe(false);
  const again = await invoke(createRedisRateLimiter({ ...defaults, max: 1, failurePolicy, client }));
  expect(again.statusCode).toBe(failurePolicy === 'local' ? 429 : 503);
  expect(evalCommand).toHaveBeenCalledTimes(1);
  resolve([1, 1, 0]);
  await vi.advanceTimersByTimeAsync(0);
  expect(first.next).toHaveBeenCalledTimes(failurePolicy === 'local' ? 1 : 0);
  expect(isRedisRateLimitingHealthy()).toBe(false);
  expect((await invoke(limiter)).next).toHaveBeenCalledOnce();
  expect(isRedisRateLimitingHealthy()).toBe(true);
  expect(evalCommand).toHaveBeenCalledTimes(2);
});

it('caps simultaneous commands across policies sharing a client and releases rejected commands', async () => {
  let reject!: (error: Error) => void;
  const command = new Promise<never>((_resolve, fail) => { reject = fail; });
  const evalCommand = vi.fn().mockReturnValue(command);
  const client = { isOpen: true, isReady: true, eval: evalCommand } as unknown as RedisClientType;
  const limiter = createRedisRateLimiter({ ...defaults, failurePolicy: 'closed', client });
  const pending = Array.from({ length: 128 }, () => invoke(limiter));
  const other = createRedisRateLimiter({ ...defaults, namespace: 'other', failurePolicy: 'closed', client });
  expect((await invoke(other)).statusCode).toBe(503);
  expect(evalCommand).toHaveBeenCalledTimes(128);
  reject(new Error('disconnected'));
  expect((await Promise.all(pending)).every(response => response.statusCode === 503)).toBe(true);
  evalCommand.mockResolvedValue([1, 1, 0]);
  expect((await invoke(limiter)).next).toHaveBeenCalledOnce();
  expect((await invoke(other)).next).toHaveBeenCalledOnce();
  expect(isRedisRateLimitingHealthy()).toBe(true);
});

it.each([[1, NaN, 0], [1, 1, -1], [1, 0, 0], [1, 3, 0], ['1', 1, 0], [0, 2, Infinity], [0, 2, 0]])(
  'treats malformed Redis reply %j as an outage', async (...reply) => {
    const client = { isOpen: true, isReady: true, eval: vi.fn().mockResolvedValue(reply) } as unknown as RedisClientType;
    const response = await invoke(createRedisRateLimiter({ ...defaults, failurePolicy: 'closed', client }));
    expect(response.statusCode).toBe(503);
    expect(response.next).not.toHaveBeenCalled();
    expect(isRedisRateLimitingHealthy()).toBe(false);
  },
);
