import type { Request, Response } from 'express';
import type { RedisClientType } from 'redis';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestSourceIpResolver } from '../../src/lib/request-ip.js';
import { createRateLimiter, _clearInMemoryRateLimitStore } from '../../src/lib/rateLimit.js';
import { createRedisRateLimiter } from '../../src/lib/rateLimitRedis.js';

// The standard suite preloads rateLimit during database setup. Re-import it
// under this file's isolated proxy policy as well as in the standalone suite.
vi.hoisted(() => vi.resetModules());

vi.mock('../../src/env.js', () => ({ env: { trustedProxies: ['10.0.0.2'] } }));
vi.mock('../../src/lib/redis.js', () => ({ client: null }));

function request(peer: string | undefined, xff?: string, extra: Record<string, string> = {}) {
  const headers = { 'x-forwarded-for': xff, ...extra };
  return { socket: { remoteAddress: peer }, ip: '198.51.100.99',
    header: (name: string) => headers[name as keyof typeof headers] } as unknown as Request;
}

const resolve = createRequestSourceIpResolver(['10.0.0.2', '2001:db8:abcd::/48']);

describe('trusted client IP policy', () => {
  it('ignores forged headers and req.ip on direct access or with no trusted proxies', () => {
    expect(resolve(request('192.0.2.10', '198.51.100.1'))).toBe('192.0.2.10');
    expect(createRequestSourceIpResolver([])(request('10.0.0.2', '198.51.100.1'))).toBe('10.0.0.2');
    expect(resolve(request(undefined, '198.51.100.1'))).toBeNull();
    expect(resolve(request('10.0.0.2', undefined, { 'x-real-ip': '198.51.100.1', forwarded: 'for=198.51.100.1' }))).toBe('10.0.0.2');
  });

  it('stops at the first untrusted address from the socket side', () => {
    expect(resolve(request('10.0.0.2', '203.0.113.99, 192.0.2.10'))).toBe('192.0.2.10');
    expect(resolve(request('10.0.0.2', '203.0.113.99, 192.0.2.10, 2001:db8:abcd::1'))).toBe('192.0.2.10');
    expect(resolve(request('10.0.0.2', '192.0.2.10, 10.0.0.3'))).toBe('10.0.0.3');
    expect(createRequestSourceIpResolver(['10.0.0.0/24'])(request('10.0.0.2', '192.0.2.10, 10.0.0.3'))).toBe('192.0.2.10');
  });

  it.each(['garbage', '', '192.0.2.1:80', 'fe80::1%eth0', '127.1'])('does not skip malformed hops: %s', (hop) => {
    expect(resolve(request('10.0.0.2', `192.0.2.10, ${hop}`))).toBe('10.0.0.2');
  });

  it('canonicalizes IPv6 and mapped IPv4 identities', () => {
    expect(resolve(request('::ffff:10.0.0.2', '::ffff:c000:020a'))).toBe('192.0.2.10');
    expect(resolve(request('2001:DB8:ABCD:0000::1', '2001:0DB8:0001:0000::1'))).toBe('2001:db8:1::1');
    expect(resolve(request('2001:db8:abce::1', '192.0.2.10'))).toBe('2001:db8:abce::1');
    expect(createRequestSourceIpResolver(['::ffff:10.0.0.0/120'])(request('10.0.0.2', '192.0.2.10'))).toBe('192.0.2.10');
  });

  it.each(['true', '1', '10.0.0.1/33', '::1/129', '10.0.0.1/no', '10.0.0.1/24/1'])('rejects invalid trust configuration: %s', (entry) => {
    expect(() => createRequestSourceIpResolver([entry])).toThrow('Invalid TRUSTED_PROXIES');
  });
});

async function invoke(limiter: ReturnType<typeof createRateLimiter>, xff: string) {
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await limiter(request('10.0.0.2', xff), res as unknown as Response, next);
  return { res, next };
}

describe('rate limit consumers and ingress', () => {
  beforeEach(() => _clearInMemoryRateLimitStore());

  it('separates clients behind nginx but keeps spoof attempts in the same memory bucket', async () => {
    const limiter = createRateLimiter({ namespace: 'proxy', max: 1, windowMs: 60000 });
    expect((await invoke(limiter, '192.0.2.10')).next).toHaveBeenCalledOnce();
    expect((await invoke(limiter, '203.0.113.99, 192.0.2.10')).res.status).toHaveBeenCalledWith(429);
    expect((await invoke(limiter, '192.0.2.11')).next).toHaveBeenCalledOnce();
  });

  it('uses the same identities for Redis buckets without connecting to Redis', async () => {
    const evaluate = vi.fn().mockResolvedValue([1, 1, 0]);
    const client = { isReady: true, isOpen: true, eval: evaluate } as unknown as RedisClientType;
    const limiter = createRedisRateLimiter({ namespace: 'proxy', max: 1, windowMs: 60000, client });
    await invoke(limiter, '192.0.2.10');
    await invoke(limiter, '203.0.113.99, 192.0.2.10');
    await invoke(limiter, '192.0.2.11');
    const keys = evaluate.mock.calls.map(call => call[1].keys[0]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
    expect(keys[0]).toMatch(/:192\.0\.2\.10$/);
  });

  it('overwrites untrusted client IP headers at both nginx ingress locations', () => {
    const nginx = readFileSync(new URL('../../../client/nginx.template.conf', import.meta.url), 'utf8');
    expect(nginx).not.toContain('$proxy_add_x_forwarded_for');
    expect(nginx.match(/proxy_set_header X-Forwarded-For \$remote_addr;/g)).toHaveLength(2);
    expect(nginx.match(/proxy_set_header X-Forwarded-Host \$host;/g)).toHaveLength(2);
    expect(nginx.match(/proxy_set_header Forwarded "";/g)).toHaveLength(2);
  });
});
