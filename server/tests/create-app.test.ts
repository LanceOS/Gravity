import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_SHELL_CONTENT_SECURITY_POLICY, createApp } from '../src/app.js';

describe('createApp', () => {
  it('returns the ready payload at the root route', async () => {
    const response = await request(createApp()).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: 'gravity-server',
      status: 'ready',
    });
  });

  it('returns the health payload', async () => {
    const response = await request(createApp()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'gravity-server',
      nodeEnv: expect.any(String),
      authBaseUrl: expect.any(String),
    });
  });

  it('sets X-Content-Type-Options: nosniff on API responses', async () => {
    const response = await request(createApp()).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Content-Type-Options: nosniff on the root route', async () => {
    const response = await request(createApp()).get('/');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
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
});
