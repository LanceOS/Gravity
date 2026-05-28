import type { Request, Response, NextFunction } from 'express';
import { client as defaultClient } from './redis.js';
import type { RedisClientType } from 'redis';

type RedisRateLimitOptions = {
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
  return {0, count}
else
  redis.call('ZADD', key, now, member)
  if expireMs and tonumber(expireMs) > 0 then
    redis.call('PEXPIRE', key, expireMs)
  end
  return {1, count + 1}
end
`;

export function createRedisRateLimiter(options: RedisRateLimitOptions) {
  const { windowMs, max, keyFn, client = defaultClient, prefix = 'gravity:rl:' } = options;
  const limiterId = `rl:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

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

      // Expecting an array like [allowedFlag, count]
      if (Array.isArray(result) && Number(result[0]) === 1) {
        return next();
      }

      res.status(429).json({ error: 'Too many requests; rate limit exceeded.' });
    } catch (err) {
      // On any Redis error, allow the request to proceed (fail-open).
      console.warn('Redis rate limiter error (falling back to allow):', err);
      return next();
    }
  };
}

export default { createRedisRateLimiter };
