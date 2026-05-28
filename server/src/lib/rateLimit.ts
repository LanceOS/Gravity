import type { Request, Response, NextFunction } from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => Promise<string> | string;
};

type StoreEntry = {
  timestamps: number[];
  windowMs: number;
  lastSeen: number;
};

// Centralized in-memory store used for single-process deployments and tests.
// This module centralizes cleanup into a single timer, trims per-entry
// timestamp lists, evicts idle entries, and performs LRU-style evictions
// when the store grows too large. For production and multi-instance
// deployments prefer a Redis-based store (not implemented here).

const centralStore = new Map<string, StoreEntry>();
let cleanupTimer: NodeJS.Timeout | null = null;
let limiterCounter = 0;

// Tunables
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute
const MAX_ENTRIES = 10_000; // protect against unbounded growth
const IDLE_EVICT_MULTIPLIER = 5; // evict entries idle for >= 5 * windowMs (min 1 hour)

function ensureCleanupTimerStarted() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();

    // Trim timestamps and remove entries that are idle.
    for (const [k, entry] of centralStore.entries()) {
      const cutoff = now - entry.windowMs;
      entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

      const idleThreshold = Math.max(entry.windowMs * IDLE_EVICT_MULTIPLIER, 60 * 60 * 1000);
      if (entry.timestamps.length === 0 && entry.lastSeen < now - idleThreshold) {
        centralStore.delete(k);
      } else {
        // persist trimmed entry
        centralStore.set(k, entry);
      }
    }

    // If the store grows beyond MAX_ENTRIES, evict oldest by lastSeen (LRU-ish)
    if (centralStore.size > MAX_ENTRIES) {
      const items = Array.from(centralStore.entries());
      items.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      const toRemove = centralStore.size - MAX_ENTRIES;
      for (let i = 0; i < toRemove; i++) centralStore.delete(items[i][0]);
    }
  }, CLEANUP_INTERVAL_MS);
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, keyFn } = options;
  const limiterId = `rl:${++limiterCounter}`;
  ensureCleanupTimerStarted();

  return async function rateLimiter(req: Request, res: Response, next: NextFunction) {
    try {
      const keyRaw = keyFn ? await keyFn(req) : req.ip;
      const key = String(keyRaw ?? req.ip);
      const compositeKey = `${limiterId}:${key}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      let entry = centralStore.get(compositeKey);
      if (!entry) {
        entry = { timestamps: [], windowMs, lastSeen: now };
      } else {
        // keep windowMs in sync (in case callers vary)
        entry.windowMs = windowMs;
      }

      // Remove stale timestamps for this window
      entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

      if (entry.timestamps.length >= max) {
        entry.lastSeen = now;
        centralStore.set(compositeKey, entry);
        res.status(429).json({ error: 'Too many requests; rate limit exceeded.' });
        return;
      }

      entry.timestamps.push(now);
      entry.lastSeen = now;
      centralStore.set(compositeKey, entry);

      next();
    } catch (err) {
      next();
    }
  };
}

// Test helper: clear the in-memory store (useful between unit tests)
export function _clearInMemoryRateLimitStore() {
  centralStore.clear();
}

export default { createRateLimiter };
