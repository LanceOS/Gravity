import { client } from './redis.js';

type AttemptRecord = { count: number; windowStart: number; expireAt: number };

const store = new Map<string, AttemptRecord>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 20;
const CLEANUP_INTERVAL_MS = 60_000;

// Simple in-process metrics for throttle observability. Exported so tests
// and lightweight telemetry integrations can read observed values.
export const throttleMetrics = {
  totalAttempts: 0,
  blockedEvents: 0,
};

function isRedisReady(): boolean {
  return !!client && (client as any).isOpen && (client as any).isReady;
}

async function redisKeyFor(key: string) {
  return `authThrottle:${key}`;
}

// Periodic cleanup for the in-memory store to avoid unbounded growth.
const _cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.expireAt <= now) store.delete(k);
  }
}, CLEANUP_INTERVAL_MS);
if (typeof (_cleanupTimer as any)?.unref === 'function') (_cleanupTimer as any).unref();

export async function recordFailedAttempt(key: string, windowMs = DEFAULT_WINDOW_MS) {
  // Try Redis first when available (preferred for cross-process throttling).
  if (isRedisReady()) {
    try {
      const rKey = await redisKeyFor(key);
      const count = (await (client as any).incr(rKey)) as number;
      if (count === 1) {
        // Set TTL for the window on first increment
        await (client as any).expire(rKey, Math.ceil(windowMs / 1000));
      }
      throttleMetrics.totalAttempts += 1;
      return count;
    } catch (err) {
      // Fall through to in-memory fallback on any Redis error
      // (throttle must be best-effort, not fatal).
    }
  }

  const now = Date.now();
  const rec = store.get(key);
  if (!rec || now > rec.expireAt) {
    const newRec: AttemptRecord = { count: 1, windowStart: now, expireAt: now + windowMs };
    store.set(key, newRec);
    throttleMetrics.totalAttempts += 1;
    return 1;
  }

  rec.count += 1;
  store.set(key, rec);
  throttleMetrics.totalAttempts += 1;
  return rec.count;
}

export async function isBlocked(key: string, maxAttempts = DEFAULT_MAX_ATTEMPTS, windowMs = DEFAULT_WINDOW_MS) {
  if (isRedisReady()) {
    try {
      const rKey = await redisKeyFor(key);
      const raw = await (client as any).get(rKey);
      const count = raw ? parseInt(raw, 10) : 0;
      const blocked = count >= maxAttempts;
      if (blocked) throttleMetrics.blockedEvents += 1;
      return blocked;
    } catch (err) {
      // Fall through to in-memory check
    }
  }

  const rec = store.get(key);
  if (!rec) return false;
  if (Date.now() > rec.expireAt) {
    store.delete(key);
    return false;
  }
  const blocked = rec.count >= maxAttempts;
  if (blocked) throttleMetrics.blockedEvents += 1;
  return blocked;
}

export async function resetAttempts(key: string) {
  if (isRedisReady()) {
    try {
      const rKey = await redisKeyFor(key);
      await (client as any).del(rKey);
    } catch (err) {
      // best-effort
    }
  }
  store.delete(key);
}

export function getThrottleMetrics() {
  return { ...throttleMetrics };
}

export default { recordFailedAttempt, isBlocked, resetAttempts, getThrottleMetrics };
