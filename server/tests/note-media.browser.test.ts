import { describe, expect, it } from 'vitest';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createApp } from '../src/app.js';
import { env } from '../src/env.js';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

// Explicit opt-in: uses pg-mem and the in-memory RustFS mock in tests/setup.ts.
// It never connects to a deployed app or manages containers.
describe.runIf(process.env.GRAVITY_NOTE_MEDIA_BROWSER === '1')('note media in a real browser', () => {
  it('uploads, renders, saves and reloads images; rejects invalid files and unauthorized reads', async () => {
    const { chromium } = await import('playwright');
    const outDir = await mkdtemp(resolve(tmpdir(), 'gravity-note-media-'));
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
    const originalOrigins = [...env.trustedOrigins];
    try {
      // Build outside Vitest's module loader so Vite's own version is used.
      execFileSync(process.execPath, [resolve('../node_modules/vite/bin/vite.js'), 'build',
        'scripts/note-media-fixture', '--config', 'vite.config.ts', '--outDir', outDir],
      { cwd: resolve('../client'), stdio: 'pipe' });
      const owner = await createAuthenticatedApi({ email: 'browser-media@example.com' });
      const { project } = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar } });
      const other = await seedWorkspaceFixture({ owner: { ...owner.user, avatarUrl: owner.user.avatar },
        workspace: { id: 'other-ws', key: 'OTHER', workspaceKey: 'OTHER-WS' },
        project: { id: 'other-project', key: 'OTHER', inviteCode: 'OTHER-INV' } });
      const outsider = await createAuthenticatedApi({ email: 'browser-outsider@example.com' });
      const note = await owner.post('/api/v1/notes').set('x-project-id', project.id).send({ title: 'Browser media', body: 'Image' });
      expect(note.status).toBe(201);
      const app = express();
      app.use(express.static(outDir));
      app.use(createApp());
      server = app.listen(0, '127.0.0.1');
      await new Promise<void>(resolve => server!.once('listening', resolve));
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      env.trustedOrigins.push(origin);
      browser = await chromium.launch({ headless: true, executablePath: process.env.GRAVITY_CHROMIUM_PATH });
      const context = await browser.newContext();
      const cookies = (cookie: string) => cookie.split('; ').map(entry => {
        const index = entry.indexOf('=');
        return { name: entry.slice(0, index), value: entry.slice(index + 1), url: origin };
      });
      await context.addCookies(cookies(owner.sessionCookie));
      const page = await context.newPage();
      await page.goto(`${origin}/?projectId=${project.id}&noteId=${note.body.id}`);
      const attach = page.getByRole('button', { name: 'Attach image', exact: true });
      await attach.waitFor();
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
      const choose = async (name: string, mimeType: string, buffer = png) => {
        const chooserPromise = page.waitForEvent('filechooser');
        await attach.click();
        await (await chooserPromise).setFiles({ name, mimeType, buffer });
      };
      await choose('my photo.png', 'image/png');
      await page.getByRole('alert').filter({ hasText: 'Rename the file' }).waitFor();
      await choose('vector.svg', 'image/svg+xml', Buffer.from('<svg/>'));
      await page.getByRole('alert').filter({ hasText: 'Choose a PNG' }).waitFor();
      const noteSaved = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes(`/notes/${note.body.id}`));
      const mediaRead = page.waitForRequest(r => r.method() === 'GET' && r.url().includes('/media/'));
      const uploaded = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/media?'));
      await choose('screen-shot_2.PNG', 'image/png');
      const upload = await uploaded;
      expect(upload.status()).toBe(201);
      const { url } = await upload.json();
      const image = page.getByRole('img', { name: 'screen-shot_2.PNG', exact: true });
      await image.waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('.rich-text-editor img')].some(img => (img as HTMLImageElement).naturalWidth > 0));
      expect(await image.getAttribute('src')).toBe(url);
      expect((await mediaRead).headers()['x-project-id']).toBeUndefined();
      expect(await image.getAttribute('alt')).toBe('screen-shot_2.PNG');
      const saveResponse = await noteSaved;
      expect(saveResponse.status()).toBe(200);
      expect((await saveResponse.json()).body).toContain(url);
      await page.getByRole('status').filter({ hasText: /^\s*Saved / }).waitFor();
      await page.reload();
      await page.waitForFunction(() => [...document.querySelectorAll('.rich-text-editor img')].some(img => (img as HTMLImageElement).naturalWidth > 0));
      expect(await image.getAttribute('src')).toBe(url);
      // Simulate an already-persisted body from before scoped upload URLs.
      const legacyUrl = url.split('?')[0];
      const saved = await owner.get(`/api/v1/notes/${note.body.id}`).set('x-project-id', project.id);
      expect(saved.body.body).toContain(url);
      const legacy = await owner.patch(`/api/v1/notes/${note.body.id}`).set('x-project-id', project.id)
        .send({ version: saved.body.version, body: saved.body.body.replaceAll(url, legacyUrl) });
      expect(legacy.status).toBe(200);
      await page.reload();
      await page.waitForFunction(() => [...document.querySelectorAll('.rich-text-editor img')].some(img => (img as HTMLImageElement).naturalWidth > 0));
      expect(await image.getAttribute('src')).toBe(legacyUrl);
      const wrongProject = new URL(url, origin);
      wrongProject.searchParams.set('projectId', other.project.id);
      expect((await context.request.get(wrongProject.href)).status()).toBe(404);
      await context.clearCookies();
      expect((await context.request.get(`${origin}${url}`)).status()).toBe(401);
      expect((await context.request.get(`${origin}${legacyUrl}`)).status()).toBe(401);
      await context.addCookies(cookies(outsider.sessionCookie));
      expect((await context.request.get(`${origin}${url}`)).status()).toBe(403);
      expect((await context.request.get(`${origin}${legacyUrl}`)).status()).toBe(403);
    } finally {
      env.trustedOrigins.splice(0, env.trustedOrigins.length, ...originalOrigins);
      await browser?.close();
      if (server) await new Promise<void>((resolve, reject) => server!.close(err => err ? reject(err) : resolve()));
      await rm(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});
