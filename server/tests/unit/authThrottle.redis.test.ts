import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedis = vi.hoisted(() => ({ isOpen: true, isReady: true, eval: vi.fn(), del: vi.fn() }));
vi.mock('../../src/lib/redis.js', () => ({ client: mockRedis }));

type Bucket = { raw: string; expireAt: number | null };
const values = new Map<string, Bucket>();

function runScript(script: string, options: { keys: string[]; arguments: string[] }) {
  const key = options.keys[0];
  const args = options.arguments;
  const prior = values.get(key);
  const bucket = prior && (prior.expireAt === null || prior.expireAt > Date.now()) ? prior : undefined;
  if (script.includes("return {1, generation}")) {
    expect(script).toContain("redis.call('PTTL', KEYS[1])");
    expect(script).toContain("redis.call('SET', KEYS[1]");
    const parsed = bucket?.raw.match(/^([^:]+):(\d+):(\d+)$/);
    const generation = parsed?.[1] ?? args[2];
    const pending = parsed ? Number(parsed[2]) : 0;
    const failed = parsed ? Number(parsed[3]) : Number(bucket?.raw ?? 0);
    const expireAt = bucket?.expireAt ?? Date.now() + Number(args[0]);
    if (pending + failed >= Number(args[1])) {
      if (bucket?.expireAt === null) values.set(key, { raw: `${generation}:${pending}:${failed}`, expireAt });
      return [0, generation];
    }
    values.set(key, { raw: `${generation}:${pending + 1}:${failed}`, expireAt });
    return [1, generation];
  }
  expect(script).toContain("if ARGV[2] == 'failed' then failed = failed + 1 end");
  if (!bucket) return 0;
  const parsed = bucket.raw.match(/^([^:]+):(\d+):(\d+)$/);
  if (!parsed) throw new Error('Invalid throttle counter');
  const [, generation, rawPending, rawFailed] = parsed;
  const pending = Number(rawPending);
  const failed = Number(rawFailed);
  if (generation !== args[0] || pending < 1) return failed;
  const nextFailed = failed + Number(args[1] === 'failed');
  if (pending === 1 && nextFailed === 0) values.delete(key);
  else values.set(key, { raw: `${generation}:${pending - 1}:${nextFailed}`, expireAt: bucket.expireAt });
  return nextFailed;
}

describe('authThrottle Redis reservation', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    values.clear();
    mockRedis.isOpen = true;
    mockRedis.isReady = true;
    vi.clearAllMocks();
    mockRedis.eval.mockImplementation(async (script: string, options: { keys: string[]; arguments: string[] }) => runScript(script, options));
    mockRedis.del.mockImplementation(async (key: string) => { values.delete(key); return 1; });
  });

  it('repairs blocked legacy counters and migrates numeric values on the next attempt', async () => {
    const throttle = await import('../../src/lib/authThrottle.js');
    values.set('authThrottle:ip:blocked', { raw: '10', expireAt: null });
    expect((await throttle.beginVerificationAttempt('ip:blocked', 10, 5000)).status).toBe('blocked');
    expect(values.get('authThrottle:ip:blocked')?.expireAt).toEqual(expect.any(Number));
    expect(values.get('authThrottle:ip:blocked')?.raw).toMatch(/^[^:]+:0:10$/);
    values.set('authThrottle:ip:legacy', { raw: '8', expireAt: null });
    const attempt = await throttle.beginVerificationAttempt('ip:legacy', 10, 5000);
    expect(attempt.status).toBe('allowed');
    if (attempt.status !== 'allowed') throw new Error('Expected reservation');
    expect(await throttle.finishVerificationAttempt('ip:legacy', attempt.generation, true, 5000)).toBe(9);
    expect(values.get('authThrottle:ip:legacy')?.raw).toMatch(/^[^:]+:0:9$/);
    expect(values.get('authThrottle:ip:legacy')?.expireAt).toEqual(expect.any(Number));
  });

  it('shares an atomic budget across instances and preserves failures when a valid attempt completes', async () => {
    const first = await import('../../src/lib/authThrottle.js');
    vi.resetModules();
    const second = await import('../../src/lib/authThrottle.js');
    const reservations = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      (index % 2 ? first : second).beginVerificationAttempt('ip:shared', 10, 5000)));
    expect(reservations.filter(result => result.status === 'allowed')).toHaveLength(10);
    expect(reservations.filter(result => result.status === 'blocked')).toHaveLength(2);
    const admitted = reservations.filter((result): result is { status: 'allowed'; generation: string } => result.status === 'allowed');
    for (const attempt of admitted.slice(0, 9)) {
      await first.finishVerificationAttempt('ip:shared', attempt.generation, true, 5000);
    }
    expect(await second.finishVerificationAttempt('ip:shared', admitted[9].generation, false, 5000)).toBe(9);
    const last = await second.beginVerificationAttempt('ip:shared', 10, 5000);
    expect(last.status).toBe('allowed');
    if (last.status !== 'allowed') throw new Error('Expected reservation');
    expect(await second.finishVerificationAttempt('ip:shared', last.generation, true, 5000)).toBe(10);
    expect((await first.beginVerificationAttempt('ip:shared', 10, 5000)).status).toBe('blocked');
  });

  it('keeps the shared budget when a command fails before or after Redis applied it', async () => {
    const throttle = await import('../../src/lib/authThrottle.js');
    mockRedis.eval.mockRejectedValueOnce(new Error('connection interrupted before execution'));
    expect((await throttle.beginVerificationAttempt('ip:interrupted', 1, 5000)).status).toBe('unavailable');
    expect(values.has('authThrottle:ip:interrupted')).toBe(false);
    mockRedis.eval.mockImplementationOnce(async (script: string, options: { keys: string[]; arguments: string[] }) => {
      runScript(script, options);
      throw new Error('reply lost after execution');
    });
    expect((await throttle.beginVerificationAttempt('ip:interrupted', 1, 5000)).status).toBe('unavailable');
    expect((await throttle.beginVerificationAttempt('ip:interrupted', 1, 5000)).status).toBe('blocked');
    const attempt = await throttle.beginVerificationAttempt('ip:finish-interrupted', 1, 5000);
    expect(attempt.status).toBe('allowed');
    if (attempt.status !== 'allowed') throw new Error('Expected reservation');
    mockRedis.eval.mockImplementationOnce(async (script: string, options: { keys: string[]; arguments: string[] }) => {
      runScript(script, options);
      throw new Error('finish reply lost after execution');
    });
    expect(await throttle.finishVerificationAttempt('ip:finish-interrupted', attempt.generation, true, 5000)).toBeNull();
    expect((await throttle.beginVerificationAttempt('ip:finish-interrupted', 1, 5000)).status).toBe('blocked');
    mockRedis.isReady = false;
    expect((await throttle.beginVerificationAttempt('ip:interrupted', 1, 5000)).status).toBe('unavailable');
  });

  it('bounds a hung Redis command and refuses replacements while it remains pending', async () => {
    const throttle = await import('../../src/lib/authThrottle.js');
    mockRedis.eval.mockImplementationOnce(() => new Promise(() => {}));
    expect((await throttle.beginVerificationAttempt('ip:hung', 1, 5000)).status).toBe('unavailable');
    expect((await throttle.beginVerificationAttempt('ip:hung', 1, 5000)).status).toBe('unavailable');
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
  });

  it('expires buckets and ignores stale completions from a previous window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const throttle = await import('../../src/lib/authThrottle.js');
    const old = await throttle.beginVerificationAttempt('ip:expiry', 1, 1000);
    expect(old.status).toBe('allowed');
    if (old.status !== 'allowed') throw new Error('Expected reservation');
    vi.setSystemTime(2000);
    const fresh = await throttle.beginVerificationAttempt('ip:expiry', 1, 1000);
    expect(fresh.status).toBe('allowed');
    if (fresh.status !== 'allowed') throw new Error('Expected reservation');
    expect(await throttle.finishVerificationAttempt('ip:expiry', old.generation, true, 1000)).toBe(0);
    expect(values.get('authThrottle:ip:expiry')?.raw).toBe(`${fresh.generation}:1:0`);
  });
});
