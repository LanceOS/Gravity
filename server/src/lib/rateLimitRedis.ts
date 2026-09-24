import type { Request, Response, NextFunction } from 'express';
import { client as defaultClient } from './redis.js';
import type { RedisClientType } from 'redis';

type RedisRateLimitOptions = {
  /** Stable policy identity, shared across middleware instances and replicas. */
  namespace: string;
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => Promise<string> | string;
  client?: RedisClientType | null;
  prefix?: string;
};

/**
 * Redis-backed rate limiter using a sorted-set (ZSET) to implement a sliding window.
 * The implementation performs an atomic Lua EVAL that:
 *  - removes old entries (by score)
 *  - checks the current count
 *  - optionally inserts the new timestamp if under the limit
 * Returns allowed/denied so middleware can respond accordingly.
 *
 * Usage: import { createRedisRateLimiter } from './rateLimitRedis.js';
 */
const LUA_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local member = ARGV[4]
local expireMs = tonumber(ARGV[5])

local cutoff = now - windowMs
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
if tonumber(count) >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfterMs = math.max(1, tonumber(oldest[2]) + windowMs - now)
  return {0, count, retryAfterMs}
else
  redis.call('ZADD', key, now, member)
  if expireMs and tonumber(expireMs) > 0 then
    redis.call('PEXPIRE', key, expireMs)
  end
  return {1, count + 1, 0}
end
`;

export function createRedisRateLimiter(options: RedisRateLimitOptions) {
  const { namespace, windowMs, max, keyFn, client = defaultClient, prefix = 'gravity:rl:' } = options;
  const limiterId = `rl:${encodeURIComponent(namespace)}:${windowMs}:${max}`;
  return async function rateLimiter(req: Request, res: Response, next: NextFunction) {
    try {
      if (!client || !client.isOpen || !client.isReady) {
        // Redis not available — fail open to avoid service disruption.
        return next();
      }

      const keyRaw = keyFn ? await keyFn(req) : req.ip;
      const keyPart = String(keyRaw ?? req.ip);
      const redisKey = `${prefix}${limiterId}:${keyPart}`;
      const now = Date.now();
      const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;
      const expireMs = Math.max(windowMs * 2, 60_000);

      // Execute Lua script atomically in Redis
      const result: unknown = await (client as any).eval(LUA_SCRIPT, {
        keys: [redisKey],
        arguments: [String(now), String(windowMs), String(max), member, String(expireMs)],
      });

      // The script returns [allowedFlag, count, retryAfterMs].
      if (Array.isArray(result) && Number(result[0]) === 1) {
        return next();
      }

      const retryAfterMs = Array.isArray(result) ? Number(result[2]) : windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((Number.isFinite(retryAfterMs) ? retryAfterMs : windowMs) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: 'Too many requests; rate limit exceeded.', retryAfterSeconds });
    } catch (err) {
      // On any Redis error, allow the request to proceed (fail-open).
      console.warn('Redis rate limiter error (falling back to allow):', err);
      return next();
    }
  };
}

export default { createRedisRateLimiter };
