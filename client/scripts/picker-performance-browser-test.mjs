import { ensureLockedBrowserDependencies } from './locked-browser-dependencies.mjs';
await ensureLockedBrowserDependencies(import.meta.url);
// Isolated production fixture: no API, database, service changes, or containers.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const { build } = await import('esbuild');
const { chromium } = await import('playwright');

const root = fileURLToPath(new URL('../..', import.meta.url));
const outDir = await mkdtemp(resolve(tmpdir(), 'gravity-picker-performance-'));
let browser;
try {
  await build({ entryPoints: [resolve(root, 'client/scripts/picker-performance-fixture/main.tsx')],
    bundle: true, minify: true, format: 'iife', outdir: outDir, entryNames: 'fixture', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}', 'import.meta.hot': 'undefined' },
    alias: { '@library': resolve(root, 'library'), '@tanstack/react-query': resolve(root, 'client/src/utils/react-query-mock.tsx') },
    loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' }, logLevel: 'warning' });
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const script = await readFile(resolve(outDir, 'fixture.js'), 'utf8');
  const css = await readFile(resolve(outDir, 'fixture.css'), 'utf8');
  for (const count of [1000, 5000]) for (const kind of ['options', 'assignment']) {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent('<!doctype html><div id="root"></div>');
    await page.addStyleTag({ content: css });
    await page.evaluate(config => { window.pickerConfig = config; window.started = performance.now(); }, { count, kind });
    await page.addScriptTag({ content: script });
    await page.waitForFunction(() => window.ready);
    const initialMs = await page.evaluate(() => performance.now() - window.started);
    const openStart = performance.now();
    if (kind === 'assignment') {
      await page.getByRole('button', { name: 'Open assignment' }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Assign', exact: true }).press('ArrowRight');
      await page.getByRole('textbox').waitFor();
    }
    const openMs = kind === 'assignment' ? performance.now() - openStart : initialMs;
    const rowRole = kind === 'assignment' ? 'menuitem' : 'checkbox';
    const picker = page.locator('[data-ticket-picker]');
    const rows = picker.locator(kind === 'assignment' ? '[role=menuitem]' : 'input[type=checkbox]');
    assert.equal(await rows.count(), kind === 'assignment' ? 52 : 50);
    const dom = await picker.locator('*').count();
    assert.ok(dom < 400, `DOM bound: ${kind} ${count} has ${dom} nodes`);
    const label = i => kind === 'assignment' ? `GRA-${i} Option ${i}` : `Option ${i}`;
    await picker.getByRole(rowRole, { name: label(49), exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.textContent || document.activeElement.closest('label')?.textContent), kind === 'assignment' ? 'GRA-50Option 50' : 'Option 50');
    await page.keyboard.press('ArrowUp');
    await picker.getByRole(rowRole, { name: label(49), exact: true }).evaluate(el => { if (document.activeElement !== el) throw Error('Reverse boundary lost focus'); });
    await page.keyboard.press('End');
    await picker.getByRole(rowRole, { name: label(count - 1), exact: true }).evaluate(el => { if (document.activeElement !== el) throw Error('End lost focus'); });
    await page.keyboard.press('Home');
    await picker.getByRole(rowRole, { name: label(0), exact: true }).evaluate(el => { if (document.activeElement !== el) throw Error('Home lost focus'); });
    // Native Tab can reach paging controls; Enter moves focus to the next page.
    await picker.getByRole(rowRole, { name: label(49), exact: true }).focus();
    await page.keyboard.press('Tab');
    await picker.getByRole(kind === 'assignment' ? 'menuitem' : 'button', { name: 'Next page' }).evaluate(el => { if (document.activeElement !== el) throw Error('Tab cannot reach pagination'); });
    await page.keyboard.press('Enter');
    await picker.getByRole(rowRole, { name: label(50), exact: true }).evaluate(el => { if (document.activeElement !== el) throw Error('Paging lost focus'); });
    const start = performance.now();
    await page.getByRole('textbox').fill(kind === 'assignment' ? `GRA-${count - 1}` : `Option ${count - 1}`);
    assert.equal(await rows.count(), 1);
    const searchMs = performance.now() - start;
    await picker.getByRole(rowRole, { name: label(count - 1), exact: true }).focus();
    await page.keyboard.press(kind === 'assignment' ? 'Enter' : 'Space');
    assert.equal(await page.locator('#selected').textContent(), `${count - 1}`);
    if (kind === 'assignment') await page.getByRole('menu', { name: 'Context Menu', exact: true }).waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ kind, count, fixtureMountMs: initialMs, openMs, searchMs, dom, maxRows: 50 }));
    if (count === 5000 && kind === 'options') {
      const cdp = await page.context().newCDPSession(page);
      const heaps = [];
      for (let round = 0; round < 5; round++) {
        await page.evaluate(() => window.churnDates());
        await cdp.send('HeapProfiler.collectGarbage');
        heaps.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
      }
      assert.ok(heaps[4] - heaps[0] < 2 * 1024 * 1024, 'Retained timestamp heap must plateau after 500,000 updates');
      console.log(JSON.stringify({ timestampUpdates: 500000, retainedHeapBytes: heaps, growthBytes: heaps[4] - heaps[0] }));
    }
    await page.close();
  }
} finally {
  await browser?.close();
  await rm(outDir, { recursive: true, force: true });
}
