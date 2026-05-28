type AttemptRecord = { count: number; windowStart: number };

const store = new Map<string, AttemptRecord>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 20;

export function recordFailedAttempt(key: string, windowMs = DEFAULT_WINDOW_MS) {
  const now = Date.now();
  const rec = store.get(key) || { count: 0, windowStart: now };
  if (now - rec.windowStart > windowMs) {
    rec.count = 1;
    rec.windowStart = now;
  } else {
    rec.count += 1;
  }
  store.set(key, rec);
  return rec.count;
}

export function isBlocked(key: string, maxAttempts = DEFAULT_MAX_ATTEMPTS, windowMs = DEFAULT_WINDOW_MS) {
  const rec = store.get(key);
  if (!rec) return false;
  if (Date.now() - rec.windowStart > windowMs) return false;
  return rec.count >= maxAttempts;
}

export function resetAttempts(key: string) {
  store.delete(key);
}

export default { recordFailedAttempt, isBlocked, resetAttempts };
