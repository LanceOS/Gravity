import { randomUUID } from 'node:crypto';
import type { RedisClientType } from 'redis';
import { client } from './redis.js';
import { env } from '../env.js';

type AttemptRecord = { pending: number; failed: number; expireAt: number; generation: string };
type AttemptDecision = { status: 'allowed'; generation: string } | { status: 'blocked' } | { status: 'unavailable' };

const store = new Map<string, AttemptRecord>();
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 10;
const CLEANUP_INTERVAL_MS = 60_000;
const MAX_LOCAL_KEYS = 10_000;
const COMMAND_TIMEOUT_MS = 1000;
const MAX_PENDING_COMMANDS = 128;
let lastCapacitySweep = -Infinity;

// One key holds a generation, in-flight count, and failed count. Numeric
// values from the earlier implementation are migrated as failed counts.
// SET PX keeps the original window and repairs keys left without a TTL.
const BEGIN_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local generation, pending, failed
if raw then
  generation, pending, failed = string.match(raw, '^([^:]+):(%d+):(%d+)$')
  if generation then
    pending = tonumber(pending)
    failed = tonumber(failed)
  else
    failed = tonumber(raw)
    if not failed or failed < 0 then return redis.error_reply('Invalid throttle counter') end
    generation = ARGV[3]
    pending = 0
  end
else
  generation = ARGV[3]
  pending = 0
  failed = 0
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then ttl = tonumber(ARGV[1]) end
if ttl < 1 then ttl = 1 end
if pending + failed >= tonumber(ARGV[2]) then
  if raw and redis.call('PTTL', KEYS[1]) < 0 then
    redis.call('SET', KEYS[1], generation .. ':' .. pending .. ':' .. failed, 'PX', ttl)
  end
  return {0, generation}
end
pending = pending + 1
redis.call('SET', KEYS[1], generation .. ':' .. pending .. ':' .. failed, 'PX', ttl)
return {1, generation}
`;

const FINISH_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local generation, pending, failed = string.match(raw, '^([^:]+):(%d+):(%d+)$')
if not generation then return redis.error_reply('Invalid throttle counter') end
pending = tonumber(pending)
failed = tonumber(failed)
if generation ~= ARGV[1] or pending < 1 then return failed end
pending = pending - 1
if ARGV[2] == 'failed' then failed = failed + 1 end
local ttl = redis.call('PTTL', KEYS[1])
if pending == 0 and failed == 0 then
  redis.call('DEL', KEYS[1])
else
  if ttl < 0 then ttl = tonumber(ARGV[3]) end
  if ttl < 1 then ttl = 1 end
  redis.call('SET', KEYS[1], generation .. ':' .. pending .. ':' .. failed, 'PX', ttl)
end
return failed
`;

// A configured but unavailable Redis fails closed instead of splitting a
// shared quota between replicas. Redis-disabled single-process setups use a
// bounded process-local counter.
export const throttleMetrics = { totalAttempts: 0, blockedEvents: 0 };
const pendingByClient = new WeakMap<RedisClientType, { count: number; stalled: number }>();
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store) if (value.expireAt <= now) store.delete(key);
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

async function evaluate(redis: RedisClientType, script: string, key: string, args: string[]): Promise<unknown> {
  let pending = pendingByClient.get(redis);
  if (!pending) { pending = { count: 0, stalled: 0 }; pendingByClient.set(redis, pending); }
  if (pending.stalled || pending.count >= MAX_PENDING_COMMANDS) throw new Error('Throttle command capacity unavailable');
  pending.count++;
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;
  const command = Promise.resolve().then(() => redis.eval(script, { keys: [key], arguments: args }));
  const release = () => { pending.count--; if (timedOut) pending.stalled--; };
  void command.then(release, release);
  try {
    return await Promise.race([command, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        pending.stalled++;
        reject(new Error('Throttle command timed out'));
      }, COMMAND_TIMEOUT_MS);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function localRecord(key: string, windowMs: number) {
  const now = Date.now();
  let record = store.get(key);
  if (record && record.expireAt <= now) { store.delete(key); record = undefined; }
  if (!record) {
    if (store.size >= MAX_LOCAL_KEYS && now - lastCapacitySweep >= 1000) {
      lastCapacitySweep = now;
      for (const [candidate, value] of store) if (value.expireAt <= now) store.delete(candidate);
    }
    if (store.size >= MAX_LOCAL_KEYS) return null;
    record = { pending: 0, failed: 0, expireAt: now + windowMs, generation: randomUUID() };
    store.set(key, record);
  }
  return record;
}

export async function beginVerificationAttempt(
  key: string, maxAttempts = DEFAULT_MAX_ATTEMPTS, windowMs = DEFAULT_WINDOW_MS,
): Promise<AttemptDecision> {
  if (client) {
    if (!client.isOpen || !client.isReady) return { status: 'unavailable' };
    try {
      const result = await evaluate(client, BEGIN_SCRIPT, `authThrottle:${key}`,
        [String(windowMs), String(maxAttempts), randomUUID()]);
      if (!Array.isArray(result) || result.length !== 2 || ![0, 1].includes(result[0])
        || typeof result[1] !== 'string' || !result[1]) throw new Error('Invalid throttle result');
      if (result[0] === 0) { throttleMetrics.blockedEvents++; return { status: 'blocked' }; }
      throttleMetrics.totalAttempts++;
      return { status: 'allowed', generation: result[1] };
    } catch { return { status: 'unavailable' }; }
  }
  if (env.redisEnabled) return { status: 'unavailable' };
  const record = localRecord(key, windowMs);
  if (!record) return { status: 'unavailable' };
  if (record.pending + record.failed >= maxAttempts) {
    throttleMetrics.blockedEvents++;
    return { status: 'blocked' };
  }
  record.pending++;
  throttleMetrics.totalAttempts++;
  return { status: 'allowed', generation: record.generation };
}

export async function finishVerificationAttempt(
  key: string, generation: string, failed: boolean, windowMs = DEFAULT_WINDOW_MS,
): Promise<number | null> {
  if (client) {
    if (!client.isOpen || !client.isReady) return null;
    try {
      const count = await evaluate(client, FINISH_SCRIPT, `authThrottle:${key}`,
        [generation, failed ? 'failed' : 'success', String(windowMs)]);
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return null;
      return count;
    } catch { return null; }
  }
  if (env.redisEnabled) return null;
  const record = store.get(key);
  if (!record || record.expireAt <= Date.now() || record.generation !== generation || record.pending < 1) return 0;
  record.pending--;
  if (failed) record.failed++;
  const count = record.failed;
  if (record.pending === 0 && record.failed === 0) store.delete(key);
  return count;
}

export async function resetAttempts(key: string) {
  if (client?.isOpen && client.isReady) {
    try { await client.del(`authThrottle:${key}`); } catch { /* best-effort test cleanup */ }
  }
  store.delete(key);
}

export function getThrottleMetrics() { return { ...throttleMetrics }; }

export default { beginVerificationAttempt, finishVerificationAttempt, resetAttempts, getThrottleMetrics };
