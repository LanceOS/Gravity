import { ensureLockedBrowserDependencies } from './locked-browser-dependencies.mjs';
await ensureLockedBrowserDependencies(import.meta.url);
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('playwright');
const { build } = await import('vite');

const outDir = await mkdtemp(resolve(tmpdir(), 'gravity-settings-history-'));
let server;
let browser;

try {
  await build({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('./settings-history-fixture', import.meta.url)),
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true },
  });
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const asset = resolve(outDir, pathname === '/' ? 'index.html' : `.${pathname}`);
      if (asset !== resolve(outDir, 'index.html') && !asset.startsWith(`${outDir}${sep}`)) {
        throw new Error('Invalid path');
      }
      const content = await readFile(asset).catch(async (error) => {
        if (error.code !== 'ENOENT' || extname(asset)) throw error;
        return readFile(resolve(outDir, 'index.html'));
      });
      response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(asset)] || 'text/html');
      response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
  browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const { from, button, settings } of [
    { from: '/workspaces/ws-1/projects/project-7/tickets/GRAV-295?status=open&labels=urgent#comments', button: 'User Settings', settings: '/account' },
    { from: '/workspaces/ws-2/teams/team-2/views/board?assigneeId=user-1&priority=high', button: 'Workspace Settings', settings: '/workspaces/ws-2/settings' },
    { from: '/workspaces/ws-2/projects/project-8/notes/note-4?search=plan', button: 'User Settings', settings: '/account' },
    { from: '/workspaces?filter=mine', button: 'Workspace Settings', settings: '/workspaces/ws-2/settings' },
  ]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}${from}`);
    await page.getByRole('button', { name: button }).click();
    await page.waitForURL(`${base}${settings}`);
    await page.goBack();
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash, from);
    await page.goForward();
    assert.equal(new URL(page.url()).pathname, settings);
    if (from.includes('GRAV-295')) await page.reload();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForURL(`${base}${from}`);
    await page.goForward();
    assert.equal(new URL(page.url()).pathname, settings);
    await page.goBack();
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash, from);
    assert.deepEqual(errors, []);
    await page.close();
  }

  for (const settings of ['/account', '/workspaces/ws-2/settings']) {
    const page = await browser.newPage();
    await page.goto(`${base}${settings}`);
    if (settings === '/account') {
      // A copied settings entry may carry the marker without a usable prior entry.
      await page.evaluate(() => window.history.replaceState({ idx: 0, usr: { gravitySettingsHistoryEntry: true } }, '', window.location.href));
    }
    await page.reload();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForURL(`${base}${settings === '/account' ? '/workspaces' : '/workspaces/ws-2'}`);
    await page.goBack();
    assert.notEqual(new URL(page.url()).pathname, settings, 'Fallback does not leave a settings entry to loop back into');
    await page.close();
  }

  console.log('Settings history browser navigation passed');
} finally {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
  await rm(outDir, { recursive: true, force: true });
}
