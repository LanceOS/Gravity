import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedis = vi.hoisted(() => ({
  isOpen: true,
  isReady: true,
  eval: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
}));
vi.mock('../../src/lib/redis.js', () => ({ client: mockRedis }));

const values = new Map<string, { count: number; expiresAt: number | null }>();

describe('authThrottle Redis counter', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    values.clear();
    mockRedis.isOpen = true;
    mockRedis.isReady = true;
    vi.clearAllMocks();
    mockRedis.eval.mockImplementation(async (script: string, options: { keys: string[]; arguments: string[] }) => {
      expect(script).toContain("redis.call('PTTL', KEYS[1])");
      expect(script).toContain("redis.call('PEXPIRE', KEYS[1], ARGV[1])");
      const key = options.keys[0];
      const now = Date.now();
      const prior = values.get(key);
      const live = prior && (prior.expiresAt === null || prior.expiresAt > now) ? prior : undefined;
      if (script.includes("redis.call('GET', KEYS[1])")) {
        if (live?.expiresAt === null) values.set(key, { count: live.count, expiresAt: now + Number(options.arguments[0]) });
        return live?.count ?? 0;
      }
      expect(script).toContain("redis.call('INCR', KEYS[1])");
      const count = (live?.count ?? 0) + 1;
      values.set(key, { count, expiresAt: live?.expiresAt ?? now + Number(options.arguments[0]) });
      return count;
    });
    mockRedis.get.mockImplementation(async (key: string) => {
      const value = values.get(key);
      return value && (value.expiresAt === null || value.expiresAt > Date.now()) ? String(value.count) : null;
    });
    mockRedis.del.mockImplementation(async (key: string) => { values.delete(key); return 1; });
  });

  it('uses a single atomic command and repairs legacy counters without a TTL', async () => {
    const { recordFailedAttempt, isBlocked } = await import('../../src/lib/authThrottle.js');
    values.set('authThrottle:ip:legacy', { count: 8, expiresAt: null });
    expect(await recordFailedAttempt('ip:legacy', 5000)).toBe(9);
    expect(values.get('authThrottle:ip:legacy')).toMatchObject({ count: 9, expiresAt: expect.any(Number) });
    expect(await isBlocked('ip:legacy', 9)).toBe(true);
    values.set('authThrottle:ip:blocked-legacy', { count: 10, expiresAt: null });
    expect(await isBlocked('ip:blocked-legacy', 10, 5000)).toBe(true);
    expect(values.get('authThrottle:ip:blocked-legacy')).toMatchObject({ expiresAt: expect.any(Number) });
    expect(mockRedis.incr).not.toHaveBeenCalled();
    expect(mockRedis.expire).not.toHaveBeenCalled();
    expect(mockRedis.eval).toHaveBeenCalledTimes(3);
  });

  it('expires counters and shares them across module instances', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const first = await import('../../src/lib/authThrottle.js');
    vi.resetModules();
    const second = await import('../../src/lib/authThrottle.js');
    expect(await first.recordFailedAttempt('ip:shared', 1000)).toBe(1);
    expect(await second.recordFailedAttempt('ip:shared', 1000)).toBe(2);
    expect(await first.isBlocked('ip:shared', 2)).toBe(true);
    vi.setSystemTime(2001);
    expect(await second.isBlocked('ip:shared', 2)).toBe(false);
    expect(await second.recordFailedAttempt('ip:shared', 1000)).toBe(1);
  });

  it('falls back locally when the Redis command is interrupted before execution', async () => {
    const { recordFailedAttempt, isBlocked } = await import('../../src/lib/authThrottle.js');
    mockRedis.eval.mockRejectedValueOnce(new Error('connection interrupted'));
    expect(await recordFailedAttempt('ip:interrupted', 1000)).toBe(1);
    mockRedis.isReady = false;
    expect(await recordFailedAttempt('ip:interrupted', 1000)).toBe(2);
    expect(await isBlocked('ip:interrupted', 2)).toBe(true);
    expect(values.has('authThrottle:ip:interrupted')).toBe(false);
  });
});
