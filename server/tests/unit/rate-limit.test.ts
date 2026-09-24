import type { NextFunction, Request, Response } from 'express';
import type { RedisClientType } from 'redis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _clearInMemoryRateLimitStore, createRateLimiter } from '../../src/lib/rateLimit.js';
import { createRedisRateLimiter } from '../../src/lib/rateLimitRedis.js';

type Limiter = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

async function invoke(limiter: Limiter, ip = 'test-client') {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
  };
  const next = vi.fn();
  await limiter({ ip } as Request, response as unknown as Response, next);
  return { ...response, next };
}

describe('rate limiter policy isolation and retry timing', () => {
  beforeEach(() => _clearInMemoryRateLimitStore());

  it('shares memory capacity only between matching namespace, policy, and client', async () => {
    const first = createRateLimiter({ namespace: 'credential-create', windowMs: 5000, max: 2 });
    const samePolicy = createRateLimiter({ namespace: 'credential-create', windowMs: 5000, max: 2 });
    const independent = createRateLimiter({ namespace: 'credential-revoke', windowMs: 5000, max: 2 });
    const differentPolicy = createRateLimiter({ namespace: 'credential-create', windowMs: 5000, max: 3 });
    expect((await invoke(first)).next).toHaveBeenCalledOnce();
    expect((await invoke(samePolicy)).next).toHaveBeenCalledOnce();
    expect((await invoke(first)).statusCode).toBe(429);
    expect((await invoke(independent)).next).toHaveBeenCalledOnce();
    expect((await invoke(differentPolicy)).next).toHaveBeenCalledOnce();
    expect((await invoke(first, 'other-client')).next).toHaveBeenCalledOnce();
  });

  it('reports the oldest accepted request expiry and does not extend a full window on denial', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const limiter = createRateLimiter({ namespace: 'retry-timing', windowMs: 5000, max: 2 });
    await invoke(limiter);
    now.mockReturnValue(11_000);
    await invoke(limiter);
    now.mockReturnValue(12_001);
    const blocked = await invoke(limiter);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers).toEqual({ 'Retry-After': '3' });
    expect(blocked.body).toEqual({ error: 'Too many requests; rate limit exceeded.', retryAfterSeconds: 3 });
    expect(blocked.next).not.toHaveBeenCalled();
    now.mockReturnValue(14_999);
    expect((await invoke(limiter)).headers['Retry-After']).toBe('1');
    now.mockReturnValue(15_000);
    expect((await invoke(limiter)).next).toHaveBeenCalledOnce();
    const stillLimited = await invoke(limiter);
    expect(stillLimited.statusCode).toBe(429);
    expect(stillLimited.headers['Retry-After']).toBe('1');
  });

  it('names Redis buckets independently of client identity and shares matching policies', async () => {
    const evaluate = vi.fn(async () => [1, 1, 0]);
    const client = { isReady: true, isOpen: true, eval: evaluate } as unknown as RedisClientType;
    const options = { namespace: 'credential:create', windowMs: 5000, max: 2, client };
    await invoke(createRedisRateLimiter(options));
    await invoke(createRedisRateLimiter(options));
    await invoke(createRedisRateLimiter({ ...options, namespace: 'credential:revoke' }));
    await invoke(createRedisRateLimiter(options), 'other-client');
    const keys = evaluate.mock.calls.map(call => (call as unknown as [string, { keys: string[] }])[1].keys[0]);
    expect(keys[0]).toBe('gravity:rl:rl:credential%3Acreate:5000:2:test-client');
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[0]);
  });

  it('converts Redis window timing into matching Retry-After headers and JSON', async () => {
    const evaluate = vi.fn().mockResolvedValueOnce([0, 2, 2999]).mockResolvedValueOnce([0, 2, 1]).mockResolvedValueOnce([1, 2, 0]);
    const client = { isReady: true, isOpen: true, eval: evaluate } as unknown as RedisClientType;
    const limiter = createRedisRateLimiter({ namespace: 'retry-timing', windowMs: 5000, max: 2, client });
    const blocked = await invoke(limiter);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['Retry-After']).toBe('3');
    expect(blocked.body).toEqual({ error: 'Too many requests; rate limit exceeded.', retryAfterSeconds: 3 });
    expect(blocked.next).not.toHaveBeenCalled();
    expect((await invoke(limiter)).headers['Retry-After']).toBe('1');
    expect((await invoke(limiter)).next).toHaveBeenCalledOnce();
  });

  it('preserves fail-open behavior while Redis is unavailable', async () => {
    const evaluate = vi.fn();
    const client = { isReady: false, isOpen: true, eval: evaluate } as unknown as RedisClientType;
    const limiter = createRedisRateLimiter({ namespace: 'offline', windowMs: 5000, max: 2, client });
    expect((await invoke(limiter)).next).toHaveBeenCalledOnce();
    expect(evaluate).not.toHaveBeenCalled();
  });
});
