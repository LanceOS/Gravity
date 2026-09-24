import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../..', import.meta.url));
const outDir = await mkdtemp(resolve(tmpdir(), 'gravity-ticket-performance-'));
const baseline = process.argv.includes('--baseline');
const regressionsOnly = process.argv.includes('--regressions-only');
const reportPath = process.env.TICKET_PERF_REPORT;
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const results = [];
const acceptance = [];
let server;
let browser;
try {
  // A small production fixture avoids requiring an API/database. Use the profiling
  // runtime explicitly: normal React production builds disable Profiler callbacks.
  await build({ entryPoints: [resolve(root, 'client/scripts/ticket-performance-fixture/main.tsx')],
    bundle: true, minify: true, format: 'esm', outdir: outDir, entryNames: 'fixture', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    alias: { '@library': resolve(root, 'library'), 'react-dom/client': require.resolve('react-dom/profiling'),
      '@tanstack/react-query': resolve(root, 'client/src/utils/react-query-mock.tsx') },
    loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' }, logLevel: 'warning' });
  await writeFile(resolve(outDir, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
  server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      const asset = resolve(outDir, path === '/' ? 'index.html' : `.${path}`);
      if (!asset.startsWith(`${outDir}${sep}`)) throw new Error('Invalid path');
      response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(asset)] || 'application/octet-stream');
      response.end(await readFile(asset));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  for (const count of regressionsOnly ? [] : [1000, 5000]) for (const view of ['list', 'board']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/?view=${view}&count=${count}`);
    const selector = view === 'list' ? '.ticket-row' : '.ticket-card';
    await page.locator(selector).first().waitFor();
    await frames(page);
    if (process.env.TICKET_PERF_SCREENSHOTS && count === 5000) await page.screenshot({ path: resolve(process.env.TICKET_PERF_SCREENSHOTS, `tickets-${view}.png`) });
    const initial = await page.evaluate(selector => ({ ...window.ticketMetrics,
      dom: document.querySelector('#view').querySelectorAll('*').length,
      tickets: document.querySelectorAll(selector).length }), selector);
    const measure = async action => {
      await page.evaluate(() => { window.ticketMetrics.renders = []; window.measureStart = performance.now(); });
      await action();
      await frames(page);
      return page.evaluate(() => ({ frameMs: performance.now() - window.measureStart, renderMs: window.ticketMetrics.renders.reduce((a, b) => a + b, 0) }));
    };
    const derivationsBefore = initial.derivations.length;
    const unrelated = await measure(() => page.locator('#rerender').evaluate(element => element.click()));
    assert.equal(await page.evaluate(() => window.ticketMetrics.derivations.length), derivationsBefore, 'Unrelated updates retain memoized derivations');
    const filter = await measure(() => page.getByRole('textbox', { name: 'Search tickets' }).fill('Search performance'));
    await page.getByRole('textbox', { name: 'Search tickets' }).fill('');
    await frames(page);
    let load;
    if (view === 'board') {
      load = await measure(() => page.getByRole('button', { name: 'Show', exact: true }).nth(1).click());
    }
    const scroller = view === 'list' ? page.getByRole('grid').first() : page.locator('.kanban-board__column').nth(1).getByRole('grid');
    const scroll = await measure(() => scroller.evaluate(element => { element.scrollTop = element.scrollHeight / 2; }));
    assert.ok(await scroller.locator(selector).count() > 0);
    const scrollDom = await page.locator('#view *').count();
    if (!baseline) {
      assert.ok(initial.tickets < (view === 'board' ? 80 : 40), 'Initial ticket DOM is bounded');
      await scroller.evaluate(element => { element.scrollTop = 0; });
      await frames(page);
      const first = scroller.locator(selector).first();
      await first.focus();
      const firstLabel = await first.getAttribute('aria-label');
      await scroller.evaluate(element => { element.scrollTop = element.scrollHeight / 2; });
      await frames(page);
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), firstLabel, 'Scrolling retains focused ticket');
      for (let i = 0; i < 35; i++) await page.keyboard.press('ArrowDown');
      assert.notEqual(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), firstLabel, 'Arrow navigation crosses virtual windows');
      await page.keyboard.press('Enter');
      assert.notEqual(await page.locator('#selected').textContent(), '', 'Keyboard activates a ticket');
      await page.keyboard.press('Home');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), firstLabel);
      for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('[data-virtual-index]')), true, 'Tab reaches unloaded DOM rows');
      await page.keyboard.press('End');
      await page.keyboard.press('Tab');
      if (view === 'list') assert.equal(await page.evaluate(() => document.activeElement.id), 'after', 'Tab leaves the final load-more control');
      if (view === 'board') {
        await scroller.evaluate(element => { element.scrollTop = 0; });
        await frames(page);
        const source = scroller.locator('.ticket-card').first();
        const key = await source.locator('.ticket-card__key').textContent();
        // Native HTML drag payload survives source-window scrolling, including empty columns.
        const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
        await source.dispatchEvent('dragstart', { dataTransfer });
        await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await frames(page);
        assert.equal(await scroller.getByText(key, { exact: true }).count(), 1, 'Dragged source stays mounted');
        const target = page.locator('.kanban-board__column').nth(2);
        await target.dispatchEvent('dragover', { dataTransfer });
        await target.dispatchEvent('drop', { dataTransfer });
        assert.match(await page.locator('#selected').textContent(), /:in_progress$/);
        await dataTransfer.dispose();
        const headers = await page.locator('.kanban-board__column').count();
        assert.equal(headers, 6, 'Grouping survives moving a card');
      }
    }
    results.push({ count, view, initial, unrelated, filter, load, scroll, scrollDom });
    assert.deepEqual(errors, []);
    console.info(`PASS ${count} ${view}: initial ${initial.tickets} tickets / ${initial.dom} nodes, scrolled ${scrollDom} nodes`);
    await page.close();
  }
  if (!baseline && !regressionsOnly) for (const view of ['list', 'board']) {
    const page = await browser.newPage({ viewport: { width: view === 'list' ? 390 : 1600, height: 480 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/?view=${view}&count=5000&skew=1`);
    const selector = view === 'list' ? '.ticket-row-mobile' : '.ticket-card';
    await page.locator(selector).first().waitFor();
    await frames(page);
    const scroller = view === 'list' ? page.getByRole('grid').first() : page.locator('.kanban-board__column').nth(1).getByRole('grid');
    const measured = await scroller.evaluate(element => ({ height: element.clientHeight, parentHeight: element.parentElement.clientHeight }));
    assert.ok(measured.height <= measured.parentHeight, 'Virtual viewport fits the short parent');
    assert.ok(await page.locator(selector).count() < 50);
    const first = scroller.locator(selector).first();
    if (process.env.TICKET_PERF_SCREENSHOTS) await page.screenshot({ path: resolve(process.env.TICKET_PERF_SCREENSHOTS, `tickets-${view}-short.png`) });
    await first.focus();
    await page.keyboard.press('End');
    if (view === 'list') {
      await page.keyboard.press('Enter'); // Expand the final group, retaining its load-more control.
      assert.equal(await page.evaluate(() => document.activeElement.tagName), 'BUTTON');
      await page.keyboard.press('Home');
      await page.keyboard.press(' ');
      assert.notEqual(await page.locator('#selected').textContent(), '');
      // Resize across the mobile breakpoint and remeasure the row pitch.
      await page.setViewportSize({ width: 1100, height: 400 });
      await page.locator('.ticket-row').first().waitFor();
      await frames(page);
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('ticket-row')), true, 'Responsive row replacement retains ticket focus');
      const dimensions = await scroller.locator('.ticket-row').evaluateAll(rows => rows.slice(0, 2).map(row => {
        const rect = row.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom };
      }));
      assert.ok(dimensions[0].bottom <= dimensions[1].top, 'Resized rows do not overlap');
    } else {
      await scroller.evaluate(element => { element.scrollTop = 0; });
      await frames(page);
      const source = scroller.locator('.ticket-card').first();
      const empty = page.locator('.kanban-board__column').nth(2);
      assert.equal(await empty.locator('.kanban-board__empty').count(), 1);
      await source.dragTo(empty, { targetPosition: { x: 60, y: 180 } });
      await page.waitForFunction(() => document.querySelector('#selected').textContent.endsWith(':in_progress'));
      assert.equal(await empty.locator('.ticket-card').count(), 1, 'Native pointer drag populates an empty column');
    }
    assert.deepEqual(errors, []);
    acceptance.push({ view, skewedTickets: 5000, viewportHeight: 480, result: 'passed' });
    console.info(`PASS ${view}: skewed dataset, short viewport, ${view === 'list' ? 'mobile resize and pagination' : 'native drag to empty column'}`);
    await page.close();
  }
  if (!baseline) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 600 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(`${url}?count=120&single=1&review=threshold`);
    const link = page.locator('.ticket-row-pr').first();
    await link.focus();
    const focusedLink = await link.elementHandle();
    for (const action of ['#remove-ticket', '#restore-tickets']) {
      // Simulate a data update without moving keyboard focus to a toolbar control.
      await page.locator(action).evaluate(element => element.click());
      await frames(page);
      assert.equal(await focusedLink.evaluate(element => document.activeElement === element), true, 'Crossing the cutoff keeps the same focused PR link');
    }
    await page.goto(`${url}?view=board&count=21&single=1&review=threshold`);
    const card = page.locator('.ticket-card').first();
    await card.focus();
    const focusedCard = await card.elementHandle();
    for (const action of ['#remove-ticket', '#restore-tickets']) {
      await page.locator(action).evaluate(element => element.click());
      await frames(page);
      assert.equal(await focusedCard.evaluate(element => document.activeElement === element), true, 'Crossing the board cutoff keeps the same focused card');
    }
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto(`${url}?count=120&single=1&labels=5`);
    await page.locator('.ticket-row-mobile').first().waitFor();
    const checkMobileRows = async () => {
      await frames(page);
      const rows = await page.locator('.ticket-row-mobile').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        const meta = element.querySelector('.ticket-row-mobile__meta').getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, metaBottom: meta.bottom };
      }));
      assert.ok(rows.length > 1 && rows.length < 40, 'Measured mobile rows stay virtualized');
      for (let i = 0; i < rows.length; i++) {
        assert.ok(rows[i].metaBottom <= rows[i].bottom, 'All wrapped labels fit inside their row');
        if (i > 0) assert.ok(rows[i - 1].bottom <= rows[i].top, 'Measured mobile rows do not overlap');
      }
    };
    await checkMobileRows();
    const mobileGrid = page.getByRole('grid');
    await mobileGrid.evaluate(element => { element.scrollTop = element.scrollHeight / 2; });
    await checkMobileRows();
    await page.setViewportSize({ width: 330, height: 600 });
    await checkMobileRows();
    await page.locator('.ticket-row-mobile').first().focus();
    await page.keyboard.press('Home');
    for (let index = 0; index < 35; index++) await page.keyboard.press('ArrowDown');
    await checkMobileRows();
    const assertFocusedRowVisible = async () => {
      await frames(page);
      const bounds = await page.evaluate(() => {
        const active = document.activeElement.getBoundingClientRect();
        const viewport = document.querySelector('[role="grid"]').getBoundingClientRect();
        return { top: active.top, bottom: active.bottom, viewportTop: viewport.top, viewportBottom: viewport.bottom };
      });
      assert.ok(bounds.top >= bounds.viewportTop - 1 && bounds.bottom <= bounds.viewportBottom + 1,
        `Keyboard navigation reveals the whole measured row: ${JSON.stringify(bounds)}`);
    };
    await assertFocusedRowVisible();
    await page.keyboard.press('End');
    await assertFocusedRowVisible();
    if (process.env.TICKET_PERF_SCREENSHOTS) await page.screenshot({ path: resolve(process.env.TICKET_PERF_SCREENSHOTS, 'tickets-wrapped-labels.png') });
    await page.setViewportSize({ width: 1100, height: 600 });
    await page.goto(`${url}?count=120&review=menu`);
    const trigger = page.getByRole('button', { name: 'GRAV-1', exact: true });
    await trigger.focus();
    await page.getByRole('grid').evaluate(element => { element.scrollTop = 2000; });
    await frames(page);
    await page.keyboard.press('Shift+F10');
    const menuItem = page.getByRole('menuitem', { name: 'Change status' });
    await menuItem.waitFor();
    assert.equal(await menuItem.evaluate(element => element === document.activeElement), true, 'Portaled menu receives focus');
    await page.keyboard.press('Escape');
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Escape returns to the retained trigger');
    await page.keyboard.press('Shift+F10');
    await menuItem.waitFor();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#selected').textContent(), 'ticket-0', 'Portaled menu action executes');
    await page.getByRole('grid').evaluate(element => { element.scrollTop = 2000; });
    await page.locator('#after').focus();
    await frames(page);
    assert.equal(await trigger.count(), 0, 'Leaving the row and portal releases the retained row');
    assert.deepEqual(errors, []);
    acceptance.push({ scenario: 'review regressions', result: 'passed' });
    console.info('PASS review regressions: list and board threshold focus, wrapped mobile labels, portaled menu focus/action/cleanup');
    await page.close();
  }
  const report = { date: new Date().toISOString(), browser: await browser.version(), baseline, viewport: '1600x900', results, acceptance };
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  else console.info(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(closed => server.close(closed));
  await rm(outDir, { recursive: true, force: true });
}
