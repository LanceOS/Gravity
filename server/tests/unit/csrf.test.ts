import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { csrfProtect } from '../../src/lib/csrf.js';

describe('csrfProtect middleware', () => {
  it('allows requests with Authorization header (bypass)', async () => {
    const app = express();
    app.use(express.json());
    app.post('/test', csrfProtect(undefined, { enforceInTest: true }), (req, res) => res.json({ ok: true }));

    const res = await request(app).post('/test').set('Authorization', 'Bearer abc').send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('allows requests with x-service-token when provided in options', async () => {
    const app = express();
    app.use(express.json());
    app.post('/test', csrfProtect(undefined, { enforceInTest: true, allowedServiceTokens: ['svc-token'] }), (req, res) => res.json({ ok: true }));

    const res = await request(app).post('/test').set('x-service-token', 'svc-token').send({});
    expect(res.status).toBe(200);
  });

  it('rejects when Origin/Referer is missing', async () => {
    const app = express();
    app.use(express.json());
    app.post('/test', csrfProtect(undefined, { enforceInTest: true }), (req, res) => res.json({ ok: true }));

    const res = await request(app).post('/test').send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Missing Origin or Referer header.' });
  });

  it('accepts a valid Origin header', async () => {
    const app = express();
    app.use(express.json());
    app.post('/test', csrfProtect(undefined, { enforceInTest: true }), (req, res) => res.json({ ok: true }));

    const res = await request(app).post('/test').set('Origin', 'http://localhost:5173').send({});
    expect(res.status).toBe(200);
  });

  it('allows same-host when Host header matches origin host', async () => {
    const app = express();
    app.use(express.json());
    app.post('/test', csrfProtect(undefined, { enforceInTest: true }), (req, res) => res.json({ ok: true }));

    const res = await request(app).post('/test').set('Origin', 'http://example.com').set('Host', 'example.com').send({});
    expect(res.status).toBe(200);
  });
});
