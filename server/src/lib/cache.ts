import { client } from './redis.js';

const KEY_PREFIX = 'gravity:';

export const CacheKeys = {
  workspaces: {
    all: () => 'all-workspaces',
    byUser: (userId: string) => `user-workspaces:${userId}`,
  },
};

function getFullKey(key: string): string {
  if (key.startsWith(KEY_PREFIX)) {
    return key;
  }
  return `${KEY_PREFIX}${key}`;
}

/**
 * Check if Redis is enabled, initialized, and connected
 */
function isRedisReady(): boolean {
  return !!client && client.isOpen && client.isReady;
}

/**
 * Retrieve a parsed value from cache
 */
export async function get<T>(key: string): Promise<T | null> {
  if (!isRedisReady()) {
    return null;
  }

  const fullKey = getFullKey(key);
  try {
    const raw = await client!.get(fullKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (parseError) {
      console.warn(`Cache parse error for key "${fullKey}". Removing malformed cache entry:`, parseError);
      // Clean up the malformed entry asynchronously
      del(key).catch(() => {});
      return null;
    }
  } catch (error) {
    console.warn(`Cache get failed for key "${fullKey}" (falling back gracefully):`, error);
    return null;
  }
}

/**
 * Set a value in the cache with a Time-To-Live (TTL) in seconds
 */
export async function set<T>(key: string, value: T, ttlSeconds = 300): Promise<boolean> {
  if (!isRedisReady()) {
    return false;
  }

  const fullKey = getFullKey(key);
  try {
    const payload = JSON.stringify(value);
    await client!.set(fullKey, payload, { EX: ttlSeconds });
    return true;
  } catch (error) {
    console.warn(`Cache set failed for key "${fullKey}":`, error);
    return false;
  }
}

/**
 * Delete an entry from the cache
 */
export async function del(key: string): Promise<boolean> {
  if (!isRedisReady()) {
    return false;
  }

  const fullKey = getFullKey(key);
  try {
    await client!.del(fullKey);
    return true;
  } catch (error) {
    console.warn(`Cache del failed for key "${fullKey}":`, error);
    return false;
  }
}

/**
 * Delete multiple entries from the cache atomically or in parallel using unlink.
 * Splitting into chunks if the array is exceptionally large to prevent blocking Redis.
 */
export async function delMany(keys: string[]): Promise<boolean> {
  if (!isRedisReady() || keys.length === 0) {
    return false;
  }

  const CHUNK_SIZE = 500;
  try {
    // Process in chunks of 500 to prevent blocking the Redis event loop
    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
      const chunk = keys.slice(i, i + CHUNK_SIZE).map(getFullKey);
      await client!.unlink(chunk);
    }
    return true;
  } catch (error) {
    const fullKeys = keys.map(getFullKey);
    console.warn(`Cache delMany failed for keys [${fullKeys.join(', ')}]:`, error);
    return false;
  }
}

/**
 * Cache-aside helper. Checks the cache first, on miss executes fetchFn,
 * caches the result, and returns it. Falls back gracefully to fetchFn on any Redis error.
 */
export async function wrap<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cached = await get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const freshData = await fetchFn();
  await set(key, freshData, ttlSeconds).catch((err) => {
    console.warn(`Cache wrap failed to set key "${key}":`, err);
  });
  return freshData;
}
