import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'vite';

const outDir = await mkdtemp(resolve(tmpdir(), 'gravity-hover-'));
let server;
let browser;
const styleOf = locator => locator.evaluate(element => {
  const style = getComputedStyle(element);
  return { background: style.backgroundColor, color: style.color, opacity: style.opacity };
});
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function settle(locator) {
  await locator.evaluate(async element => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
}
async function tokenColor(page, token) {
  return page.evaluate(token => {
    const probe = document.createElement('span');
    probe.style.cssText = `display:none;background:var(${token})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, token);
}
async function capture(page, selector, action) {
  await page.evaluate(selector => {
    const element = document.querySelector(selector);
    window.hoverSamples = [];
    const sample = () => {
      const style = getComputedStyle(element);
      window.hoverSamples.push({ background: style.backgroundColor, color: style.color, opacity: style.opacity });
      window.hoverFrame = requestAnimationFrame(sample);
    };
    window.hoverFrame = requestAnimationFrame(sample);
  }, selector);
  try {
    await action();
    await frames(page);
    return await page.evaluate(() => window.hoverSamples);
  } finally {
    await page.evaluate(() => cancelAnimationFrame(window.hoverFrame));
  }
}

try {
  await build({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('./hover-fixture', import.meta.url)),
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
  for (const theme of ['coal-black', 'marble-blue']) {
    // Keep real transitions enabled: reduced motion would hide hover state interruptions.
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, reducedMotion: 'no-preference' });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}`);
    await page.locator('#default').waitFor();
    const outside = () => page.mouse.move(1080, 820);
    const rerender = () => page.locator('#rerender').evaluate(element => element.click());
    const cases = [
      ['#default', '--color-surface-card', 'svg', 'span'],
      ['#primary', '--color-primary-hover', 'svg', 'span'],
      ['#ghost', '--color-state-hover-overlay', 'svg', 'span'],
      ['#custom', '--color-surface-card', 'svg', 'span'],
      ['.ticket-card', '--surface-glass-strong', '.ticket-card__key', '.ticket-card__title'],
      ['.ticket-row', '--surface-glass-strong', '.ticket-row-key', '.ticket-row-title'],
    ];
    for (const [selector, token, firstChild, secondChild] of cases) {
      const target = page.locator(selector);
      await outside();
      await settle(target);
      const rest = await styleOf(target);
      await target.hover();
      await settle(target);
      const hovered = await styleOf(target);
      assert.equal(hovered.background, await tokenColor(page, token), `${theme} ${selector}: component hover overrides generic clickable`);
      assert.notEqual(hovered.background, rest.background, `${selector}: hovering gives visual feedback`);
      const stable = await capture(page, selector, async () => {
        await target.locator(firstChild).first().hover();
        await rerender();
        await target.locator(secondChild).last().hover();
        await frames(page);
      });
      assert.ok(stable.length > 0);
      for (const sample of stable) assert.deepEqual(sample, hovered, `${selector}: child crossings and React rerenders retain hover`);
      if (selector === '#custom') assert.equal(await page.locator('#enters').textContent(), '1', 'Custom mouseenter handler runs once, without replacing visual behavior');
      const rapid = await capture(page, selector, async () => {
        for (let i = 0; i < 3; i++) { await outside(); await frames(page); await target.hover(); }
        await outside();
        await settle(target);
      });
      for (const sample of rapid) {
        assert.equal(sample.opacity, rest.opacity, `${selector}: rapid movement keeps opacity stable`);
        assert.equal(sample.color, rest.color, `${selector}: rapid movement keeps text readable`);
      }
      assert.deepEqual(await styleOf(target), rest, `${selector}: leaving restores the original surface`);
    }
    for (const selector of ['#disabled', '#loading']) {
      const target = page.locator(selector);
      await outside();
      const rest = await styleOf(target);
      assert.equal(await target.isDisabled(), true);
      const samples = await capture(page, selector, async () => {
        await target.hover({ force: true });
        await rerender();
        await settle(target);
      });
      for (const sample of samples) assert.deepEqual(sample, rest, `${selector}: disabled/loading controls do not react to hover`);
    }
    await page.getByRole('button', { name: 'Choose project' }).click();
    const option = page.getByRole('option', { name: 'Second project' });
    await option.hover();
    await settle(option);
    const hovered = await styleOf(option);
    assert.equal(hovered.background, await tokenColor(page, '--color-base100'), 'Dropdown option retains its own hover treatment');
    assert.equal(hovered.opacity, '1');
    const optionSamples = await capture(page, '.select-option[data-active="true"]', async () => {
      await option.locator('[aria-hidden]').hover();
      await rerender();
      await option.locator('.select-option__label').hover();
    });
    for (const sample of optionSamples) assert.deepEqual(sample, hovered, 'Dropdown descendant crossings and rerenders retain the active surface');
    assert.ok(Number(await page.locator('#revision').textContent()) >= cases.length, 'Fixture actually rerendered during the checks');
    assert.deepEqual(errors, []);
    console.info(`PASS ${theme}: buttons, tickets, disabled/loading, and dropdown hover stability`);
    await page.close();
  }
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(closed => server.close(closed));
  await rm(outDir, { recursive: true, force: true });
}
