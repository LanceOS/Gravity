import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cache from '../src/lib/cache.js';
import { setClient } from '../src/lib/redis.js';

type K = cache.CacheKey;

// Mock the Redis client from redis.ts
const mockRedisClient = {
  isOpen: false,
  isReady: false,
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  unlink: vi.fn(),
};

describe('Cache Service Caching & Fallback Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.isOpen = false;
    mockRedisClient.isReady = false;
    setClient(mockRedisClient as any);
  });

  afterEach(() => {
    setClient(null);
  });

  describe('When Redis is Offline / Disabled', () => {
    it('get() should return null without calling Redis', async () => {
      const result = await cache.get('test-key' as K);
      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('set() should return false without calling Redis', async () => {
      const result = await cache.set('test-key' as K, { foo: 'bar' });
      expect(result).toBe(false);
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('del() should return false without calling Redis', async () => {
      const result = await cache.del('test-key' as K);
      expect(result).toBe(false);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('delMany() should return false without calling Redis', async () => {
      const result = await cache.delMany(['test-key1' as K, 'test-key2' as K]);
      expect(result).toBe(false);
      expect(mockRedisClient.unlink).not.toHaveBeenCalled();
    });

    it('wrap() should execute fetchFn directly on Redis offline', async () => {
      const fetchFn = vi.fn().mockResolvedValue('fresh-db-data');
      const result = await cache.wrap('test-key' as K, 60, fetchFn);
      expect(result).toBe('fresh-db-data');
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });
  });

  describe('When Redis is Online & Connected', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('get() should return parsed JSON value from Redis on cache hit', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ a: 1 }));
      const result = await cache.get<{ a: number }>('test-key' as K);
      expect(result).toEqual({ a: 1 });
      expect(mockRedisClient.get).toHaveBeenCalledWith('gravity:test-key');
    });

    it('get() should return null on cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const result = await cache.get('non-existent' as K);
      expect(result).toBeNull();
    });

    it('get() should return null and delete malformed cache entry if JSON parsing fails', async () => {
      mockRedisClient.get.mockResolvedValue('invalid-json');
      mockRedisClient.del.mockResolvedValue(true);
      const result = await cache.get('bad-key' as K);
      expect(result).toBeNull();
      // It should call del to clean up the bad entry
      expect(mockRedisClient.del).toHaveBeenCalledWith('gravity:bad-key');
    });

    it('set() should serialize and store payload in Redis with TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      const payload = { user: 'alice' };
      const success = await cache.set('user:1' as K, payload, 120);
      expect(success).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'gravity:user:1',
        JSON.stringify(payload),
        { EX: 120 }
      );
    });

    it('del() should call redis client.del with namespace', async () => {
      mockRedisClient.del.mockResolvedValue(1);
      const success = await cache.del('user:1' as K);
      expect(success).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('gravity:user:1');
    });

    it('delMany() should call redis client.unlink with chunked namespaces', async () => {
      mockRedisClient.unlink.mockResolvedValue(2);
      const success = await cache.delMany(['user:1' as K, 'user:2' as K]);
      expect(success).toBe(true);
      expect(mockRedisClient.unlink).toHaveBeenCalledWith(['gravity:user:1', 'gravity:user:2']);
    });

    it('wrap() should return cached data on cache hit without calling fetchFn', async () => {
      const cachedData = { data: 'old' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));
      const fetchFn = vi.fn().mockResolvedValue({ data: 'new' });

      const result = await cache.wrap('my-key' as K, 60, fetchFn);
      expect(result).toEqual(cachedData);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(mockRedisClient.get).toHaveBeenCalledWith('gravity:my-key');
    });

    it('wrap() should call fetchFn and cache the result on cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue('OK');
      const fetchFn = vi.fn().mockResolvedValue('fresh-aggregate-data');

      const result = await cache.wrap('my-key' as K, 300, fetchFn);
      expect(result).toBe('fresh-aggregate-data');
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'gravity:my-key',
        JSON.stringify('fresh-aggregate-data'),
        { EX: 300 }
      );
    });

    it('wrap() should coalesce concurrent requests and only call fetchFn once', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue('OK');
      
      let callCount = 0;
      const fetchFn = vi.fn().mockImplementation(async () => {
        callCount++;
        // Simulate an expensive delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'expensive-data';
      });

      // Fire two concurrent cache wraps for the same key
      const [res1, res2] = await Promise.all([
        cache.wrap('coalesce-key' as K, 300, fetchFn),
        cache.wrap('coalesce-key' as K, 300, fetchFn),
      ]);

      expect(res1).toBe('expensive-data');
      expect(res2).toBe('expensive-data');
      
      // Ensure fetchFn was only invoked exactly once despite 2 concurrent calls
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(callCount).toBe(1);
    });
  });

  describe('Graceful Degradation under Redis Errors', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('get() should return null gracefully on connection or socket error', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection lost'));
      const result = await cache.get('my-key' as K);
      expect(result).toBeNull();
    });

    it('set() should return false gracefully on Redis command failure', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Redis command timeout'));
      const success = await cache.set('my-key' as K, 'value');
      expect(success).toBe(false);
    });

    it('delMany() should return false gracefully on Redis command failure', async () => {
      mockRedisClient.unlink.mockRejectedValue(new Error('Redis unlink failure'));
      const success = await cache.delMany(['my-key1' as K, 'my-key2' as K]);
      expect(success).toBe(false);
    });

    it('wrap() should fallback to executing fetchFn gracefully when Redis throws an exception', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis is down'));
      const fetchFn = vi.fn().mockResolvedValue('database-direct-data');

      const result = await cache.wrap('my-key' as K, 60, fetchFn);
      expect(result).toBe('database-direct-data');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });
});
