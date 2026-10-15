import { client } from './redis.js';

type AttemptRecord = { count: number; windowStart: number; expireAt: number };

const store = new Map<string, AttemptRecord>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 10;
const CLEANUP_INTERVAL_MS = 60_000;

// An EVAL runs both commands without a client-side interruption point. PTTL
// also repairs counters left without an expiry by the previous INCR/EXPIRE path.
const RECORD_FAILURE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

const CHECK_FAILURE_SCRIPT = `
local count = redis.call('GET', KEYS[1])
if not count then return 0 end
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return tonumber(count) or 0
`;

// Simple in-process metrics for throttle observability. Exported so tests
// and lightweight telemetry integrations can read observed values.
export const throttleMetrics = {
  totalAttempts: 0,
  blockedEvents: 0,
};

function isRedisReady(): boolean {
  return !!client && (client as any).isOpen && (client as any).isReady;
}

function redisKeyFor(key: string) {
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
      const rKey = redisKeyFor(key);
      const count = await client!.eval(RECORD_FAILURE_SCRIPT, {
        keys: [rKey], arguments: [String(windowMs)],
      });
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) throw new Error('Invalid throttle counter');
      throttleMetrics.totalAttempts += 1;
      return count;
    } catch (err) {
      // Fall through to in-memory fallback on any Redis error
      // (throttle must be best-effort, not fatal).
    }
  }

  const now = Date.now();
  const rec = store.get(key);
  if (!rec || now >= rec.expireAt) {
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
      const rKey = redisKeyFor(key);
      const count = await client!.eval(CHECK_FAILURE_SCRIPT, {
        keys: [rKey], arguments: [String(windowMs)],
      });
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new Error('Invalid throttle counter');
      const blocked = count >= maxAttempts;
      if (blocked) throttleMetrics.blockedEvents += 1;
      return blocked;
    } catch (err) {
      // Fall through to in-memory check
    }
  }

  const rec = store.get(key);
  if (!rec) return false;
  if (Date.now() >= rec.expireAt) {
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
      const rKey = redisKeyFor(key);
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
