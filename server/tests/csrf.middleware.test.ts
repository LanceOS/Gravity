import { describe, it, expect } from 'vitest';
import { csrfProtect } from '../src/lib/csrf.js';

function makeReq(headers: Record<string, string | undefined>, method = 'POST') {
  return {
    method,
    get(name: string) {
      const key = name.toLowerCase();
      return headers[key] as string | undefined;
    },
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

describe('CSRF middleware', () => {
  it('blocks POST without Origin or Referer', () => {
    const mw = csrfProtect(undefined, { enforceInTest: true });
    const req = makeReq({}, 'POST');
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res._getStatus()).toBe(403);
    expect(res._getBody()).toEqual({ error: 'Missing Origin or Referer header.' });
  });

  it('allows when Origin matches allowed origins', () => {
    const mw = csrfProtect(['http://example.com'], { enforceInTest: true });
    const req = makeReq({ origin: 'http://example.com' }, 'POST');
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res._getStatus()).toBe(200);
  });

  it('allows when Authorization header present', () => {
    const mw = csrfProtect(undefined, { enforceInTest: true });
    const req = makeReq({ authorization: 'Bearer token' }, 'POST');
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('allows safe methods without Origin', () => {
    const mw = csrfProtect(undefined, { enforceInTest: true });
    const req = makeReq({}, 'GET');
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('allows when Referer derives to an allowed origin', () => {
    const mw = csrfProtect(['http://example.com'], { enforceInTest: true });
    const req = makeReq({ referer: 'http://example.com/path' }, 'POST');
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('allows when x-service-token matches trusted tokens', () => {
    const mw = csrfProtect(undefined, { enforceInTest: true, allowedServiceTokens: ['svc-secret-1'] });
    const req = makeReq({ 'x-service-token': 'svc-secret-1' }, 'POST');
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });
});
