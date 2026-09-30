import type { Request, Response } from 'express';
import { describe, it, expect, vi } from 'vitest';
import { csrfProtect } from '../src/lib/csrf.js';

vi.mock('../src/env.js', () => ({ env: {
  nodeEnv: 'test', trustedOrigins: ['https://app.example'],
  trustedProxies: [], csrfAllowHostFallback: false,
} }));
vi.mock('../src/lib/serviceTokens.js', () => ({ getTrustedServiceTokens: () => [] }));

function check(headers: Record<string, string> = {}, peer: string | null = '10.0.0.2',
  options: Parameters<typeof csrfProtect>[1] = {}, origins = ['https://app.example'], method = 'POST') {
  const middleware = csrfProtect(origins, {
    enforceInTest: true, allowHostFallback: true, trustedProxies: ['10.0.0.2'], ...options,
  });
  const req = { method, get: (name: string) => headers[name],
    socket: { remoteAddress: peer ?? undefined }, ip: '10.0.0.2' } as unknown as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  middleware(req, res as unknown as Response, next);
  return next.mock.calls.length ? 200 : res.status.mock.calls[0][0];
}

const forwarded = { 'x-forwarded-host': 'app.example' };

describe('CSRF proxy fallback policy', () => {
  it('requires explicit opt-in, configured hosts and a trusted socket peer', () => {
    expect(check(forwarded)).toBe(200);
    expect(check(forwarded, null)).toBe(403);
    expect(check(forwarded, '10.0.0.2', { allowHostFallback: false })).toBe(403);
    expect(check(forwarded, '10.0.0.2', { allowHostFallback: undefined })).toBe(403);
    expect(check(forwarded, '10.0.0.2', { trustedProxies: [] })).toBe(403);
    expect(check(forwarded, '10.0.0.2', { trustedProxies: undefined })).toBe(403);
    expect(check(forwarded, '10.0.0.2', {}, [])).toBe(403);
    expect(check({ ...forwarded, 'x-forwarded-for': '10.0.0.2' }, '192.0.2.1')).toBe(403);
  });

  it('preserves safe methods, test opt-out and trusted service-token bypasses', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(check({}, null, {}, undefined, method)).toBe(200);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(check({}, null, {}, undefined, method)).toBe(403);
    }
    expect(check({}, null, { enforceInTest: false })).toBe(200);
    expect(check({ authorization: 'Bearer token' }, null)).toBe(403);
    expect(check({ authorization: 'Bearer token', origin: 'https://evil.example' })).toBe(403);
    for (const header of ['x-service-token', 'x-api-key']) {
      expect(check({ [header]: 'valid' }, null, { allowedServiceTokens: ['valid'] })).toBe(200);
      expect(check({ [header]: 'invalid' }, null, { allowedServiceTokens: ['valid'] })).toBe(403);
    }
  });

  it.each([
    ['10.0.0.0/24', '10.0.0.2'],
    ['10.0.0.2', '::ffff:10.0.0.2'],
    ['10.0.0.0/24', '::ffff:0a00:0002'],
    ['::ffff:10.0.0.0/120', '10.0.0.2'],
    ['2001:db8::1', '2001:0DB8:0000::1'],
    ['2001:db8:abcd::/48', '2001:DB8:ABCD::2'],
  ])('uses shared exact/CIDR matching for %s and %s', (trust, peer) => {
    expect(check(forwarded, peer, { trustedProxies: [trust] })).toBe(200);
    expect(check({ origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', host: 'evil.example' }, peer,
      { trustedProxies: [trust] })).toBe(403);
  });

  it.each(['10.0.1.2', '2001:db8:abce::2', 'garbage', '127.1', 'fe80::1%eth0', '10.0.0.2:80', ''])
  ('rejects untrusted or invalid peers: %s', peer => {
    expect(check(forwarded, peer, { trustedProxies: ['10.0.0.0/24', '2001:db8:abcd::/48'] })).toBe(403);
  });

  it.each(['https://evil.example', 'http://app.example', 'https://app.example:444', 'null', 'malformed'])
  ('never overrides a disallowed explicit origin: %s', origin => {
    const host = origin.includes('://') ? new URL(origin).host : origin;
    expect(check({ origin, 'x-forwarded-host': host, host })).toBe(403);
    expect(check({ origin, host })).toBe(403);
    expect(check({ origin, ...forwarded })).toBe(403);
  });

  it('preserves explicit allowed origins and Referers, with Origin taking precedence', () => {
    expect(check({ origin: 'https://app.example' }, '192.0.2.1')).toBe(200);
    expect(check({ referer: 'https://app.example/path' }, '192.0.2.1')).toBe(200);
    expect(check({ origin: 'https://evil.example', referer: 'https://app.example/path', ...forwarded })).toBe(403);
    expect(check({ referer: 'https://evil.example/path', ...forwarded })).toBe(403);
    expect(check({ referer: 'invalid', ...forwarded })).toBe(403);
    expect(check({ origin: '', ...forwarded })).toBe(403);
    expect(check({ origin: '', referer: 'https://app.example/path', ...forwarded })).toBe(403);
    expect(check({ referer: '', ...forwarded })).toBe(403);
    expect(check({ referrer: 'https://app.example/path' }, '192.0.2.1')).toBe(200);
    expect(check({ referrer: 'invalid', ...forwarded })).toBe(403);
    expect(check({ referrer: '', ...forwarded })).toBe(403);
  });

  it.each([{}, { host: 'app.example' }, { 'x-forwarded-host': 'evil.example' },
    { 'x-forwarded-host': 'app.example, evil.example' }, { 'x-forwarded-host': 'app.example:444' }])
  ('requires one explicitly allowed forwarded host when headers are missing: %j', headers => {
    expect(check(headers)).toBe(403);
  });

  it('matches configured IPv6 hosts and non-default ports without dropping the port', () => {
    expect(check({ 'x-forwarded-host': '[2001:db8::1]:8443' }, '10.0.0.2', {},
      ['https://[2001:db8::1]:8443'])).toBe(200);
    expect(check({ 'x-forwarded-host': 'app.example:8443' }, '10.0.0.2', {},
      ['https://app.example:8443'])).toBe(200);
    expect(check(forwarded, '10.0.0.2', {}, ['https://app.example:8443'])).toBe(403);
  });

  it.each(['true', '10.0.0.1/33', '::1/129', '::ffff:10.0.0.0/95', '10.0.0.1/no'])
  ('fails at construction for invalid trust configuration: %s', trust => {
    expect(() => check(forwarded, '10.0.0.2', { trustedProxies: [trust] })).toThrow('Invalid TRUSTED_PROXIES');
  });
});
