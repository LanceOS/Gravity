import { client } from './redis.js';

const KEY_PREFIX = 'gravity:';

export type CacheKey = string & { readonly __brand: unique symbol };

export const CacheKeys = {
  workspaces: {
    all: () => 'all-workspaces' as CacheKey,
    byUser: (userId: string) => `user-workspaces:${userId}` as CacheKey,
  },
  memberships: {
    workspaceRole: (workspaceId: string, userId: string) =>
      `membership:workspace:${workspaceId}:user:${userId}:role` as CacheKey,
    workspaceMember: (workspaceId: string, userId: string) =>
      `membership:workspace:${workspaceId}:user:${userId}:member` as CacheKey,
    projectMember: (projectId: string, userId: string) =>
      `membership:project:${projectId}:user:${userId}:role` as CacheKey,
    projectWorkspace: (projectId: string) => `membership:project:${projectId}:workspace` as CacheKey,
    teamWorkspace: (teamId: string) => `membership:team:${teamId}:workspace` as CacheKey,
  },
};

const inFlightRequests = new Map<string, Promise<any>>();

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
export async function get<T>(key: CacheKey): Promise<T | null> {
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
      void del(key);
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
export async function set<T>(key: CacheKey, value: T, ttlSeconds = 300): Promise<boolean> {
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
export async function del(key: CacheKey): Promise<boolean> {
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
 * Delete multiple entries from the cache using UNLINK.
 * Splits into chunks to avoid sending extremely large commands.
 */
export async function delMany(keys: CacheKey[]): Promise<boolean> {
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
 * Includes Promise coalescing to prevent cache stampedes (thundering herd).
 */
export async function wrap<T>(
  key: CacheKey,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cached = await get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Promise coalescing: if a request is already in flight for this key, await it
  const inFlightKey = getFullKey(key);
  if (inFlightRequests.has(inFlightKey)) {
    return inFlightRequests.get(inFlightKey) as Promise<T>;
  }

  const fetchPromise = fetchFn()
    .then((freshData) => {
      void set(key, freshData, ttlSeconds);
      return freshData;
    })
    .finally(() => {
      inFlightRequests.delete(inFlightKey);
    });

  inFlightRequests.set(inFlightKey, fetchPromise);
  return fetchPromise;
}
