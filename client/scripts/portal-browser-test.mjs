import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const { build } = await import(process.env.GRAVITY_PORTAL_VITE_MODULE || 'vite');

const outDir = await mkdtemp(resolve(tmpdir(), 'gravity-portal-'));
const artifacts = process.env.GRAVITY_PORTAL_TEST_ARTIFACTS;
const reportOnly = process.env.GRAVITY_PORTAL_REPORT_ONLY === '1';
const failures = [];
const results = [];
let server;
let browser;
function check(condition, message) {
  if (!condition) failures.push(message);
}
try {
  await build({ configFile: false,
    root: fileURLToPath(new URL('./portal-fixture', import.meta.url)),
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
  browser = await chromium.launch({ headless: true, executablePath: process.env.GRAVITY_PORTAL_BROWSER });
  if (artifacts) await mkdir(artifacts, { recursive: true });
  for (const motion of ['no-preference', 'reduce']) {
    const cases = ['modal', 'drawer', 'popover', 'tooltip', 'select', 'contextmenu', 'toast'].filter((scenario) =>
      !process.env.GRAVITY_PORTAL_SCENARIOS || process.env.GRAVITY_PORTAL_SCENARIOS.split(',').includes(scenario)).flatMap((scenario) =>
      (['modal', 'drawer', 'popover'].includes(scenario) ? [false, true] : [false]).flatMap((initial) =>
        (scenario === 'popover' ? ['left', 'right', 'center', 'custom', 'mobile'] : ['right']).map((align) => ({ scenario, initial, align }))));
    for (const { scenario, initial, align } of cases) {
      const name = `${scenario}${scenario === 'popover' ? `-${align}` : ''}-${initial ? 'initial' : 'interaction'}-${motion}`;
      const viewportWidth = align === 'mobile' ? 390 : 800;
      const page = await browser.newPage({ viewport: { width: viewportWidth, height: 600 }, reducedMotion: motion });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/?scenario=${scenario}&align=${align}${initial ? '&initial' : ''}`);
      const open = async () => {
        if (scenario === 'tooltip') await page.getByRole('button', { name: 'Tooltip trigger' }).hover();
        else if (scenario === 'select') await page.getByRole('button', { name: 'Portal select' }).click();
        else if (scenario === 'contextmenu') await page.getByRole('button', { name: 'Context target' }).click({ button: 'right' });
        else await page.getByRole('button', { name: 'Open overlay' }).click();
      };
      if (!initial) await open();
      const overlay = scenario === 'toast' ? page.getByText('Portal toast', { exact: true }).locator('..') : page.locator('[role="dialog"], [role="tooltip"], [role="listbox"], [role="menu"]').first();
      await overlay.waitFor();
      await page.waitForTimeout(300);
      const frames = await page.evaluate(() => window.portalFrames);
      check(frames.length > 0, `${name}: overlay paints`);
      const animated = ['modal', 'drawer', 'popover', 'tooltip', 'contextmenu', 'toast'].includes(scenario);
      if (animated && motion === 'no-preference') {
        check(frames.some((frame) => scenario === 'drawer' ? frame.x > 401 : frame.opacity < 0.99), `${name}: entrance is visible across frames`);
      }
      if (motion === 'reduce') check(frames.every((frame) => frame.opacity === 1), `${name}: reduced motion has no fade`);
      check(await overlay.evaluate((element) => Number(getComputedStyle(element).opacity)) === 1, `${name}: entrance settles fully visible`);
      const box = await overlay.boundingBox();
      check(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewportWidth + 1 && box.y + box.height <= 601, `${name}: settled overlay fits viewport`);
      if (scenario === 'popover') {
        const trigger = await page.getByRole('button', { name: 'Popover trigger' }).boundingBox();
        if (align === 'custom') check(box.width === 320, `${name}: consumer CSS width is preserved`);
        if (align === 'mobile') check(box.width === viewportWidth - 16, `${name}: mobile filter fills between its CSS insets`);
        const expectedLeft = (width) => align === 'mobile' ? 8 : Math.max(16, Math.min(viewportWidth - width - 16, (align === 'right' || align === 'custom') ? trigger.x + trigger.width - width : align === 'center' ? trigger.x + trigger.width / 2 - width / 2 : trigger.x));
        check(Math.abs(frames[0].x - expectedLeft(frames[0].width)) < 2, `${name}: first frame is aligned and clamped`);
        // Change only the child: the Popover itself receives no new props.
        await page.getByRole('button', { name: 'Grow content' }).click();
        await page.waitForTimeout(100);
        const grown = await overlay.boundingBox();
        check(Math.abs(grown.x - expectedLeft(grown.width)) < 2, `${name}: content resize preserves alignment`);
        check(grown.x + grown.width <= viewportWidth, `${name}: growing content remains in viewport`);
        results.push({ name, first: frames[0], samples: frames, box, grown });
      } else results.push({ name, first: frames[0], samples: frames, box });
      if (scenario === 'contextmenu') {
        await page.getByRole('menuitem', { name: 'More actions' }).hover();
        const submenu = page.getByRole('menu', { name: 'Submenu', exact: true });
        await submenu.waitFor();
        await page.waitForTimeout(200);
        const nestedBox = await submenu.boundingBox();
        const parentBox = await page.getByRole('menuitem', { name: 'More actions' }).boundingBox();
        check(Math.abs(nestedBox.y - parentBox.y) < 2, `${name}: submenu stays beside its parent`);
      }
      if (artifacts) await page.screenshot({ path: resolve(artifacts, `${name}.png`) });
      if (scenario === 'modal' || scenario === 'drawer') {
        await page.getByRole('button', { name: 'Close overlay', exact: true }).click();
        await overlay.waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
        await page.evaluate(() => { window.portalFrames.length = 0; });
        await open();
        await overlay.waitFor();
        await page.waitForTimeout(300);
        const reopened = await page.evaluate(() => window.portalFrames);
        if (motion === 'no-preference') check(reopened.some((frame) => scenario === 'drawer' ? frame.x > 401 : frame.opacity < 0.99), `${name}: reopen entrance animates`);
      }
      if (motion === 'no-preference' && (scenario === 'modal' || scenario === 'drawer')) {
        const original = await overlay.elementHandle();
        await page.getByRole('button', { name: 'Restart overlay' }).click();
        await page.waitForTimeout(400);
        check(await original.evaluate((element) => element.isConnected), `${name}: reopening during exit preserves the mounted dialog`);
        check(await overlay.evaluate((element) => Number(getComputedStyle(element).opacity)) === 1, `${name}: interrupted exit settles visible`);
        check(await page.evaluate(() => document.body.style.overflow) === 'hidden', `${name}: reopened dialog retains scroll lock`);
      }
      if (motion === 'no-preference' && scenario === 'tooltip') {
        const original = await overlay.elementHandle();
        await page.mouse.move(10, 150);
        await page.waitForTimeout(50);
        await page.getByRole('button', { name: 'Tooltip trigger' }).hover();
        await page.waitForTimeout(300);
        check(await original.evaluate((element) => element.isConnected), `${name}: reentering during exit preserves the mounted tooltip`);
        check(await overlay.count() === 1, `${name}: reentering during exit keeps the tooltip mounted`);
        if (await overlay.count()) check(await overlay.evaluate((element) => Number(getComputedStyle(element).opacity)) === 1, `${name}: reentered tooltip settles visible`);
      }
      check(errors.length === 0, `${name}: browser errors ${errors.join(', ')}`);
      console.info(`CHECKED ${name}`);
      if (artifacts) await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ results, failures }, null, 2));
      await page.close();
    }
  }
  console.info(`${results.length} browser scenarios; ${failures.length} failures`);
  failures.forEach((failure) => console.error(failure));
  if (artifacts) await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ results, failures }, null, 2));
  if (!reportOnly) assert.deepEqual(failures, [], 'Portal consumer acceptance');
} finally {
  await browser?.close();
  if (server?.listening) await new Promise((closed) => server.close(closed));
  await rm(outDir, { recursive: true, force: true });
}
