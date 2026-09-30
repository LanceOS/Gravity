import { createHash, randomUUID } from 'node:crypto';
import { getRequestSourceIp } from './request-ip.js';
import type { Request, Response, NextFunction } from 'express';
import { client as defaultClient } from './redis.js';
import type { RedisClientType } from 'redis';

type RedisRateLimitOptions = {
  /** Stable policy identity, shared across middleware instances and replicas. */
  namespace: string;
  /** Required outage behavior: sensitive/costly endpoints must fail closed. */
  failurePolicy: 'closed' | 'local';
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

// One process-wide fallback budget: do not evict live buckets to admit new keys.
// A quiet-window counter is conservative relative to a sliding window and uses
// constant space per key, even for policies with large request limits.
const MAX_LOCAL_KEYS = 10_000;
const localStore = new Map<string, { count: number; expiresAt: number }>();
let lastCapacitySweep = -Infinity;
const health = new Map<string, { degraded: boolean; lastLogAt: number }>();
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of localStore) if (entry.expiresAt <= now) localStore.delete(key);
}, 60_000);
cleanup.unref();

export function isRedisRateLimitingHealthy() {
  return ![...health.values()].some(state => state.degraded);
}

function setDegraded(id: string, degraded: boolean) {
  const state = health.get(id)!;
  if (state.degraded === degraded) return;
  state.degraded = degraded;
  const now = Date.now();
  // Throttle transitions too: flapping must not produce a per-request log storm.
  if (now - state.lastLogAt >= 60_000) {
    state.lastLogAt = now;
    console.warn('Redis rate limiter health', { policy: id, status: degraded ? 'degraded' : 'recovered' });
  }
}

function reject(res: Response, status: 429 | 503, retryAfterMs: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.status(status).json({ error: status === 429
    ? 'Too many requests; rate limit exceeded.'
    : 'Rate limiting temporarily unavailable.', retryAfterSeconds });
}

// Redis may stay ready while a command never replies. Bound both request wait
// time and retained commands; do not launch replacements for timed-out work.
const COMMAND_TIMEOUT_MS = 1000;
const MAX_PENDING_COMMANDS = 128;
const pendingByClient = new WeakMap<RedisClientType, { count: number; stalled: number }>();
async function evaluate(client: RedisClientType, key: string, args: string[]): Promise<unknown> {
  let pending = pendingByClient.get(client);
  if (!pending) {
    pending = { count: 0, stalled: 0 };
    pendingByClient.set(client, pending);
  }
  if (pending.stalled || pending.count >= MAX_PENDING_COMMANDS) throw new Error('Limiter command capacity unavailable');
  pending.count++;
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;
  const command = Promise.resolve().then(() => client.eval(LUA_SCRIPT, { keys: [key], arguments: args }));
  // Both fulfillment and rejection release capacity, even after the caller's
  // deadline. Late replies never call next or change the observed health state.
  const release = () => { pending.count--; if (timedOut) pending.stalled--; };
  void command.then(release, release);
  try {
    return await Promise.race([command, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        pending.stalled++;
        reject(new Error('Limiter command timed out'));
      }, COMMAND_TIMEOUT_MS);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function validResult(result: unknown, max: number): result is [number, number, number] {
  if (!Array.isArray(result) || result.length !== 3
    || !result.every(value => Number.isSafeInteger(value) && value >= 0)) return false;
  const [allowed, count, retry] = result;
  return allowed === 1 ? count >= 1 && count <= max && retry === 0
    : allowed === 0 && count >= max && retry > 0;
}

export function createRedisRateLimiter(options: RedisRateLimitOptions) {
  const { namespace, windowMs, max, failurePolicy, keyFn, client = defaultClient, prefix = 'gravity:rl:' } = options;
  if (!namespace || !Number.isSafeInteger(windowMs) || windowMs <= 0 || !Number.isSafeInteger(max) || max <= 0
    || !['closed', 'local'].includes(failurePolicy)) throw new Error('Invalid Redis rate limit policy');
  const limiterId = `rl:${encodeURIComponent(namespace)}:${windowMs}:${max}`;
  const policyId = `${prefix}${limiterId}`;
  if (!health.has(policyId)) health.set(policyId, { degraded: false, lastLogAt: -Infinity });

  return async function rateLimiter(req: Request, res: Response, next: NextFunction) {
    let keyPart: string;
    try {
      const keyRaw = keyFn ? await keyFn(req) : getRequestSourceIp(req);
      keyPart = String(keyRaw ?? getRequestSourceIp(req) ?? 'unknown');
    } catch {
      // Never bypass a policy when its identity cannot be resolved.
      return reject(res, 503, 1000);
    }
    const redisKey = `${policyId}:${keyPart}`;
    let result: unknown;
    try {
      if (!client?.isOpen || !client.isReady) throw new Error('Redis not ready');
      const now = Date.now();
      result = await evaluate(client, redisKey,
        [String(now), String(windowMs), String(max), `${now}:${randomUUID()}`, String(Math.max(windowMs * 2, 60_000))]);
      if (!validResult(result, max)) throw new Error('Invalid limiter result');
    } catch {
      setDegraded(policyId, true);
      if (failurePolicy === 'closed') return reject(res, 503, 1000);
      const now = Date.now();
      const localKey = createHash('sha256').update(redisKey).digest('hex');
      let entry = localStore.get(localKey);
      if (entry && entry.expiresAt <= now) { localStore.delete(localKey); entry = undefined; }
      if (!entry) {
        // Prune only at capacity; active keys are never evicted for new keys.
        if (localStore.size >= MAX_LOCAL_KEYS) {
          if (now - lastCapacitySweep >= 1000) {
            lastCapacitySweep = now;
            for (const [key, value] of localStore) if (value.expiresAt <= now) localStore.delete(key);
          }
          if (localStore.size >= MAX_LOCAL_KEYS) return reject(res, 503, 1000);
        }
        entry = { count: 0, expiresAt: now + windowMs };
        localStore.set(localKey, entry);
      }
      if (entry.count >= max) return reject(res, 429, entry.expiresAt - now);
      entry.count++;
      entry.expiresAt = now + windowMs;
      return next();
    }
    setDegraded(policyId, false);
    // Let fallback buckets expire naturally, so brief recovery/outage cycles
    // cannot reset the local budget. No request keys are retained in health.
    if ((result as number[])[0] === 1) return next();
    return reject(res, 429, Math.max(1, (result as number[])[2]));
  };
}

export default { createRedisRateLimiter };
