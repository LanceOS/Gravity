import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_SHELL_CONTENT_SECURITY_POLICY, createApp } from '../src/app.js';
import { env } from '../src/env.js';

describe('createApp', () => {
  it('returns the ready payload at the root route', async () => {
    const response = await request(createApp()).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: 'gravity-server',
      status: 'ready',
    });
  });

  it('returns the lightweight liveness payload', async () => {
    const response = await request(createApp()).get('/api/v1/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'gravity-server',
    });
  });

  it('sets X-Content-Type-Options: nosniff on API responses', async () => {
    const response = await request(createApp()).get('/api/v1/health/live');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Content-Type-Options: nosniff on the root route', async () => {
    const response = await request(createApp()).get('/');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('uses trusted origins for credentialed CORS when CORS_ORIGINS is empty', async () => {
    const configuredCors = [...env.corsOrigins];
    const configuredTrusted = [...env.trustedOrigins];
    try {
      env.corsOrigins.splice(0);
      env.trustedOrigins.splice(0, env.trustedOrigins.length, 'https://app.example');
      const app = createApp();

      const allowed = await request(app).options('/api/v1/health/live')
        .set('Origin', 'https://app.example')
        .set('Access-Control-Request-Method', 'GET');
      expect(allowed.status).toBe(204);
      expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
      expect(allowed.headers.vary).toContain('Origin');

      const hostile = await request(app).get('/api/v1/health/live')
        .set('Origin', 'https://evil.example');
      expect(hostile.status).toBe(200);
      expect(hostile.headers).not.toHaveProperty('access-control-allow-origin');
      expect(hostile.headers).not.toHaveProperty('access-control-allow-credentials');
      expect(hostile.headers.vary).toContain('Origin');

      const hostilePreflight = await request(app).options('/api/v1/health/live')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET');
      expect(hostilePreflight.headers).not.toHaveProperty('access-control-allow-origin');
      expect(hostilePreflight.headers).not.toHaveProperty('access-control-allow-credentials');
      expect(hostilePreflight.headers.vary).toContain('Origin');
    } finally {
      env.corsOrigins.splice(0, env.corsOrigins.length, ...configuredCors);
      env.trustedOrigins.splice(0, env.trustedOrigins.length, ...configuredTrusted);
    }
  });

  it('allows an explicit CORS-only origin without credential access', async () => {
    const configuredCors = [...env.corsOrigins];
    const configuredTrusted = [...env.trustedOrigins];
    try {
      env.corsOrigins.splice(0, env.corsOrigins.length, 'http://localhost:5173');
      env.trustedOrigins.splice(0, env.trustedOrigins.length, 'http://localhost:8080');
      const app = createApp();

      const allowed = await request(app).get('/api/v1/health/live')
        .set('Origin', 'http://localhost:5173');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(allowed.headers).not.toHaveProperty('access-control-allow-credentials');
      expect(allowed.headers.vary).toContain('Origin');

      const preflight = await request(app).options('/api/v1/health/live')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');
      expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(preflight.headers).not.toHaveProperty('access-control-allow-credentials');

      const authSession = await request(app).get('/api/auth/session')
        .set('Origin', 'http://localhost:5173');
      expect(authSession.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(authSession.headers).not.toHaveProperty('access-control-allow-credentials');

      const notListed = await request(app).get('/api/v1/health/live')
        .set('Origin', 'http://localhost:8080');
      expect(notListed.headers).not.toHaveProperty('access-control-allow-origin');

      // Each app keeps a stable policy even if another test changes env later.
      env.corsOrigins.splice(0, env.corsOrigins.length, 'https://other.example');
      env.trustedOrigins.splice(0, env.trustedOrigins.length, 'http://localhost:5173');
      const original = await request(app).get('/api/v1/health/live')
        .set('Origin', 'http://localhost:5173');
      expect(original.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(original.headers).not.toHaveProperty('access-control-allow-credentials');
      const laterOrigin = await request(app).get('/api/v1/health/live')
        .set('Origin', 'https://other.example');
      expect(laterOrigin.headers).not.toHaveProperty('access-control-allow-origin');

      env.corsOrigins.splice(0, env.corsOrigins.length, 'http://localhost:5173');
      const credentialed = await request(createApp()).get('/api/v1/health/live')
        .set('Origin', 'http://localhost:5173');
      expect(credentialed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(credentialed.headers['access-control-allow-credentials']).toBe('true');
    } finally {
      env.corsOrigins.splice(0, env.corsOrigins.length, ...configuredCors);
      env.trustedOrigins.splice(0, env.trustedOrigins.length, ...configuredTrusted);
    }
  });

  it('keeps the nginx and Express application-shell CSPs aligned', async () => {
    const nginxTemplate = await fs.readFile(
      fileURLToPath(new URL('../../client/nginx.template.conf', import.meta.url)),
      'utf8',
    );
    const nginxPolicy = nginxTemplate.match(
      /add_header\s+Content-Security-Policy\s+"([^"]+)"\s+always;/,
    )?.[1];

    expect(nginxPolicy).toBe(APP_SHELL_CONTENT_SECURITY_POLICY);
    expect(nginxPolicy).toContain('trusted-types gravity-editor dompurify ProseMirrorClipboard');
    expect(nginxPolicy).toContain("require-trusted-types-for 'script'");
    expect(nginxPolicy).toContain('report-uri /api/v1/csp-reports');
    const reportLocation = nginxTemplate.match(/location = \/api\/v1\/csp-reports \{([\s\S]*?)\n  \}/)?.[1];
    expect(reportLocation).toContain('access_log off;');
    expect(reportLocation).toContain('client_max_body_size 16k;');
    expect(reportLocation).toContain('proxy_pass ${BACKEND_UPSTREAM};');
    for (const header of ['Authorization', 'Cookie', 'Referer', 'Forwarded', 'X-Forwarded-Host',
      'X-Real-IP', 'X-Forwarded-For', 'X-Forwarded-Proto']) {
      expect(reportLocation).toContain(`proxy_set_header ${header} "";`);
    }
  });

  it('sets security headers on the SPA fallback, direct shell request, and unknown API routes', async () => {
    const mockCwd = vi.spyOn(process, 'cwd');
    let fixturesRoot: string | null = null;

    try {
      fixturesRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gravity-app-test-'));
      const publicDir = path.join(fixturesRoot, 'public');
      const spaIndex = path.join(publicDir, 'index.html');
      const spaFixture = '<!doctype html><html><body>gravity-spa-fallback</body></html>';

      mockCwd.mockReturnValue(fixturesRoot);
      await fs.mkdir(publicDir, { recursive: true });
      await fs.writeFile(spaIndex, spaFixture);

      const spaResponse = await request(createApp()).get('/some/client/route');

      expect(spaResponse.status).toBe(200);
      expect(spaResponse.text).toContain('gravity-spa-fallback');
      expect(spaResponse.headers['content-type']).toContain('text/html');
      expect(spaResponse.headers['x-content-type-options']).toBe('nosniff');
      expect(spaResponse.headers['content-security-policy']).toBe(APP_SHELL_CONTENT_SECURITY_POLICY);

      const directShellResponse = await request(createApp()).get('/index.html');

      expect(directShellResponse.status).toBe(200);
      expect(directShellResponse.headers['content-security-policy']).toBe(APP_SHELL_CONTENT_SECURITY_POLICY);

      const oauthConsentResponse = await request(createApp()).get('/oauth/consent?request=fixture');
      expect(oauthConsentResponse.status).toBe(200);
      expect(oauthConsentResponse.headers['content-security-policy']).toBe(APP_SHELL_CONTENT_SECURITY_POLICY);
    } finally {
      mockCwd.mockRestore();
      if (fixturesRoot) {
        await fs.rm(fixturesRoot, { recursive: true, force: true });
      }
    }

    const notFoundResponse = await request(createApp()).get('/api/v1/does-not-exist');

    expect(notFoundResponse.status).toBe(404);
    expect(notFoundResponse.body).toEqual({ error: 'Not found' });
    expect(notFoundResponse.headers['x-content-type-options']).toBe('nosniff');
  });

  it('accepts CSP reports on the public API path before dependency admission', async () => {
    const response = await request(createApp()).post('/api/v1/csp-reports')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': {
        'effective-directive': 'script-src', 'blocked-uri': 'inline',
      } }));

    expect(response.status).toBe(204);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
