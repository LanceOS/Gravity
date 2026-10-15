import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordFailedAttempt, isBlocked, resetAttempts, getThrottleMetrics } from '../../src/lib/authThrottle.js';

describe('authThrottle in-memory behavior', () => {
  const key = 'test-throttle-key';

  beforeEach(async () => {
    await resetAttempts(key);
  });

  it('counts attempts and blocks after threshold and exposes metrics', async () => {
    // Use a small threshold for the test
    for (let i = 0; i < 3; i++) {
      await recordFailedAttempt(key, 60_000);
    }

    const blocked = await isBlocked(key, 3, 60_000);
    expect(blocked).toBe(true);

    const metrics = getThrottleMetrics();
    expect(metrics.totalAttempts).toBeGreaterThanOrEqual(3);
    expect(metrics.blockedEvents).toBeGreaterThanOrEqual(1);
  });

  it('expires the local fallback at the exact window boundary', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000);
      await recordFailedAttempt(key, 1000);
      expect(await isBlocked(key, 1)).toBe(true);
      vi.setSystemTime(2000);
      expect(await isBlocked(key, 1)).toBe(false);
      expect(await recordFailedAttempt(key, 1000)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
