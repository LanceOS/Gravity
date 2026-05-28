import type { Request, Response, NextFunction } from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => Promise<string> | string;
};

export function createRateLimiter(options: RateLimitOptions) {
  const store = new Map<string, number[]>();
  const { windowMs, max, keyFn } = options;

  // Periodic cleanup to avoid memory growth
  setInterval(() => {
    const cutoff = Date.now() - windowMs * 2;
    for (const [k, arr] of store.entries()) {
      const filtered = arr.filter((ts) => ts > cutoff);
      if (filtered.length === 0) store.delete(k);
      else store.set(k, filtered);
    }
  }, Math.max(60000, windowMs));

  return async function rateLimiter(req: Request, res: Response, next: NextFunction) {
    try {
      const keyRaw = keyFn ? await keyFn(req) : req.ip;
      const key = String(keyRaw ?? req.ip);
      const now = Date.now();
      const windowStart = now - windowMs;
      const arr = store.get(key) || [];
      const recent = arr.filter((ts) => ts > windowStart);
      if (recent.length >= max) {
        res.status(429).json({ error: 'Too many requests; rate limit exceeded.' });
        return;
      }
      recent.push(now);
      store.set(key, recent);
      next();
    } catch (err) {
      next();
    }
  };
}

export default { createRateLimiter };
