import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'vite';

const outDir = await mkdtemp(resolve(tmpdir(), 'gravity-sidebar-'));
const artifacts = process.env.GRAVITY_SIDEBAR_TEST_ARTIFACTS;
let server;
let browser;
const colors = {};

async function activeStyle(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color, style.boxShadow, style.borderRadius];
  });
}

try {
  await build({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('./sidebar-fixture', import.meta.url)),
    logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const asset = resolve(outDir, pathname === '/' ? 'index.html' : `.${pathname}`);
      if (!asset.startsWith(`${outDir}${sep}`)) throw new Error('Invalid path');
      response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(asset)] || 'application/octet-stream');
      response.end(await readFile(asset));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
  browser = await chromium.launch({ headless: true });
  if (artifacts) await mkdir(artifacts, { recursive: true });
  for (const theme of ['light', 'dark']) {
    for (const view of ['flat', 'teams']) {
      for (const mode of ['expanded', 'compact', 'mobile']) {
        const name = `${theme}-${view}-${mode}`;
        const page = await browser.newPage({ viewport: { width: mode === 'mobile' ? 390 : 1100, height: 900 }, reducedMotion: 'reduce' });
        await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
        const errors = [];
        page.on('pageerror', (error) => { errors.push(error.message); console.error(`${name}: ${error.message}`); });
        await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&view=${view}&mode=${mode}`);
        const openMobileSidebar = async () => {
          await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
          await page.waitForFunction(() => {
            const drawer = document.querySelector('.mobile-sidebar-drawer');
            return drawer && Math.abs(drawer.getBoundingClientRect().x) < 1;
          });
        };
        if (mode === 'compact') await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
        if (mode === 'mobile') await openMobileSidebar();
        const sidebar = page.locator('.app-sidebar');
        await sidebar.waitFor();
        // ContextMenu owns a display:contents wrapper; inspect sidebar-owned elements.
        assert.equal(await sidebar.locator('[class*="sidebar"][style]').count(), 0, 'Sidebar components have no inline styles');
        const box = await sidebar.boundingBox();
        if (mode === 'mobile') {
          const drawer = await page.locator('.mobile-sidebar-drawer').boundingBox();
          assert.equal(drawer.width, 320);
          assert.equal(box.width, drawer.width - 1, 'Sidebar fits inside the drawer border');
        } else {
          assert.equal(box.width, mode === 'compact' ? 64 : 240);
        }
        const background = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor);
        assert.notEqual(background, 'rgba(0, 0, 0, 0)');
        colors[theme] = background;
        const active = sidebar.locator('.sidebar-item--active').first();
        const selectedStyle = await activeStyle(active);
        assert.notEqual(selectedStyle[0], 'rgba(0, 0, 0, 0)');
        for (const item of await sidebar.locator('.sidebar-item--active').all()) {
          assert.deepEqual(await activeStyle(item), selectedStyle, 'All selected rows share their visual treatment');
        }
        for (const item of await sidebar.locator('.sidebar-item:visible').all()) {
          const rect = await item.boundingBox();
          assert.ok(rect.x >= box.x && rect.x + rect.width <= box.x + box.width, 'Rows fit the sidebar');
          if (mode === 'mobile') assert.ok(rect.height >= 40, 'Mobile rows retain touch sizing');
          if (mode === 'compact') {
            const icon = await item.locator('.sidebar-item__icon').boundingBox();
            assert.ok(Math.abs(icon.x + icon.width / 2 - (rect.x + rect.width / 2)) < 1, 'Compact icons are centered');
          }
        }
        await sidebar.locator('.sidebar-user-menu__trigger').click();
        const account = page.getByRole('button', { name: 'Account Preferences', exact: true });
        await account.waitFor();
        assert.deepEqual(await activeStyle(account), selectedStyle, 'User menu uses the same selected treatment');
        const menu = await account.boundingBox();
        assert.ok(menu.x >= 0 && menu.x + menu.width <= page.viewportSize().width, 'Menu fits the viewport');
        // Bounding boxes alone do not detect ancestor clipping or another stacking layer.
        await account.click({ trial: true, position: { x: menu.width - 8, y: menu.height / 2 } });
        await sidebar.locator('.sidebar-user-menu__trigger').click();
        if (artifacts) await page.screenshot({ path: resolve(artifacts, `${name}.png`) });
        const branch = page.getByRole('button', { name: view === 'flat' ? 'Gravity Core' : 'Engineering', exact: true });
        await branch.click();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement.closest('[inert], [aria-hidden="true"]')), false,
          'Tab skips collapsed branch content');
        assert.equal(await sidebar.locator('.sidebar-user-menu__trigger').evaluate((el) => el === document.activeElement), true);
        await branch.click();
        if (view === 'teams' && mode !== 'compact') {
          const toggle = sidebar.locator('.sidebar-navigation__group-toggle');
          assert.equal(await toggle.locator('svg').evaluate((el) => getComputedStyle(el).transform), 'matrix(0, 1, -1, 0, 0, 0)', 'Expanded projects chevron points down');
          await toggle.click();
          assert.equal(await page.getByRole('button', { name: 'Gravity Core', exact: true }).count(), 0);
          await toggle.click();
          assert.equal(await page.getByRole('button', { name: 'Gravity Core', exact: true }).count(), 1);
        }
        if (view === 'flat') {
          const notes = page.getByRole('button', { name: 'Notes', exact: true });
          const issues = page.getByRole('button', { name: /^All Issues/ });
          await issues.click();
          await page.getByText('Current view: issues', { exact: true }).waitFor();
          assert.equal(await notes.getAttribute('aria-current'), null);
          assert.equal(await issues.getAttribute('aria-current'), 'page');
          if (mode === 'mobile') await openMobileSidebar();
          await notes.click();
          await page.getByText('Current view: notes', { exact: true }).waitFor();
          assert.equal(await notes.getAttribute('aria-current'), 'page');
          assert.equal(await issues.getAttribute('aria-current'), null);
          if (mode === 'mobile') await openMobileSidebar();
          const label = page.getByRole('button', { name: /^Design/ });
          await label.click();
          assert.equal(await label.getAttribute('aria-pressed'), 'true');
          await label.click();
          assert.equal(await label.getAttribute('aria-pressed'), 'false');
        }
        assert.deepEqual(errors, []);
        console.info(`PASS ${name}`);
        await page.close();
      }
    }
  }
  assert.notEqual(colors.light, colors.dark, 'Light and dark themes resolve distinct sidebar surfaces');
} finally {
  await browser?.close();
  if (server?.listening) await new Promise((closed) => server.close(closed));
  await rm(outDir, { recursive: true, force: true });
}
