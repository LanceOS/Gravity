import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginVerificationAttempt, finishVerificationAttempt, resetAttempts, getThrottleMetrics } from '../../src/lib/authThrottle.js';
import { env } from '../../src/env.js';

describe('authThrottle in-memory behavior', () => {
  const key = 'test-throttle-key';
  beforeEach(async () => { await resetAttempts(key); });
  afterEach(() => vi.useRealTimers());

  it('reserves concurrent attempts before verification and retains only failures', async () => {
    const attempts = await Promise.all(Array.from({ length: 4 }, () => beginVerificationAttempt(key, 3, 1000)));
    expect(attempts.map(attempt => attempt.status)).toEqual(['allowed', 'allowed', 'allowed', 'blocked']);
    const admitted = attempts.filter((attempt): attempt is Extract<typeof attempt, { status: 'allowed' }> => attempt.status === 'allowed');
    expect(await finishVerificationAttempt(key, admitted[0].generation, true, 1000)).toBe(1);
    expect(await finishVerificationAttempt(key, admitted[1].generation, false, 1000)).toBe(1);
    expect(await finishVerificationAttempt(key, admitted[2].generation, true, 1000)).toBe(2);
    const next = await beginVerificationAttempt(key, 3, 1000);
    expect(next.status).toBe('allowed');
    if (next.status !== 'allowed') throw new Error('Expected reservation');
    expect(await finishVerificationAttempt(key, next.generation, true, 1000)).toBe(3);
    expect((await beginVerificationAttempt(key, 3, 1000)).status).toBe('blocked');
    expect(getThrottleMetrics()).toMatchObject({ totalAttempts: expect.any(Number), blockedEvents: expect.any(Number) });
  });

  it('expires the fallback at the exact window boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const attempt = await beginVerificationAttempt(key, 1, 1000);
    expect(attempt.status).toBe('allowed');
    if (attempt.status !== 'allowed') throw new Error('Expected reservation');
    expect(await finishVerificationAttempt(key, attempt.generation, true, 1000)).toBe(1);
    vi.setSystemTime(2000);
    expect((await beginVerificationAttempt(key, 1, 1000)).status).toBe('allowed');
    expect(await finishVerificationAttempt(key, attempt.generation, true, 1000)).toBe(0);
  });

  it('fails closed when Redis is configured but no client is available', async () => {
    const previous = env.redisEnabled;
    env.redisEnabled = true;
    try {
      expect((await beginVerificationAttempt(key, 1, 1000)).status).toBe('unavailable');
      expect(await finishVerificationAttempt(key, 'missing-generation', true, 1000)).toBeNull();
    } finally {
      env.redisEnabled = previous;
    }
  });
});
