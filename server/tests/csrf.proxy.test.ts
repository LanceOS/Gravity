import { describe, it, expect } from 'vitest';
import { csrfProtect } from '../src/lib/csrf.js';

function makeReq(headers: Record<string, string | undefined>, remoteAddr?: string, method = 'POST') {
  return {
    method,
    get(name: string) {
      const key = name.toLowerCase();
      return headers[key] as string | undefined;
    },
    socket: { remoteAddress: remoteAddr },
  } as any;
}

function makeRes() {
  let _status = 200;
  let _body: any = null;
  return {
    status(code: number) {
      _status = code;
      return this;
    },
    json(obj: any) {
      _body = obj;
      return this;
    },
    _getStatus() {
      return _status;
    },
    _getBody() {
      return _body;
    },
  } as any;
}

describe('CSRF proxy fallback behavior', () => {
  it('accepts when X-Forwarded-Host matches allowed host and immediate remote is trusted', () => {
    const mw = csrfProtect(['http://localhost:5173'], { enforceInTest: true, allowHostFallback: true, trustedProxies: ['127.0.0.1'] });
    const req = makeReq({ 'x-forwarded-host': 'localhost:5173' }, '127.0.0.1');
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res._getStatus()).toBe(200);
  });

  it('rejects when X-Forwarded-Host provided but immediate remote is not trusted', () => {
    const mw = csrfProtect(['http://localhost:5173'], { enforceInTest: true, allowHostFallback: true, trustedProxies: ['10.0.0.1'] });
    const req = makeReq({ 'x-forwarded-host': 'localhost:5173' }, '127.0.0.1');
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res._getStatus()).toBe(403);
  });

  it('rejects when only Host header present (no X-Forwarded-Host) even if immediate remote is trusted', () => {
    const mw = csrfProtect(['http://example.com'], { enforceInTest: true, allowHostFallback: true, trustedProxies: ['127.0.0.1'] });
    const req = makeReq({ host: 'example.com' }, '127.0.0.1');
    // Provide an Origin that differs from allowed so middleware will attempt fallback
    req.method = 'POST';
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false); // no Origin provided and Host without X-Forwarded-Host should not match allowed in this case
  });
});
