import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { build } from 'vite';

const outDir = await mkdtemp(resolve(tmpdir(), 'gravity-focus-accessibility-'));
const engines = { chromium, firefox, webkit };
const browserNames = (process.env.GRAVITY_FOCUS_TEST_BROWSERS || 'chromium,firefox,webkit').split(',');
let server;
let browser;
const failures = [];
const artifacts = process.env.GRAVITY_FOCUS_TEST_ARTIFACTS;
let snapshotIndex = 0;

async function focused(page, name) {
  await page.waitForFunction((expected) => {
    const element = document.activeElement;
    return (element?.getAttribute('aria-label') || element?.textContent || '') === expected;
  }, name, { timeout: 3000 });
}

// ariaSnapshot is Playwright's DOM-derived view, not a native engine AX tree.
// Check Chromium's actual AX nodes separately, so display:contents regressions
// cannot pass solely because the DOM still contains roles and labels.
async function semantics(page, browserName, expected) {
  const snapshot = await page.locator('body').ariaSnapshot();
  // A body ariaSnapshot can prune a visibility:hidden ancestor even when a
  // descendant restores visibility. Resolve each expected accessible control
  // directly; the native AX checks below independently verify its ancestry.
  for (const [role, name] of expected) {
    const element = page.getByRole(role, { name, exact: true });
    assert.equal(await element.count(), 1, `Expected one ${role} "${name}"`);
  }
  if (artifacts) {
    await mkdir(artifacts, { recursive: true });
    await writeFile(resolve(artifacts, `${browserName}-${snapshotIndex++}.aria.yml`), snapshot);
  }
  if (browserName === 'chromium') {
    const session = await page.context().newCDPSession(page);
    try {
      const { nodes } = await session.send('Accessibility.getFullAXTree');
      if (artifacts) await writeFile(resolve(artifacts, `chromium-${snapshotIndex - 1}.ax.json`), JSON.stringify(nodes, null, 2));
      for (const [role, name] of expected) {
        assert.ok(nodes.some((node) => !node.ignored && node.role?.value === role && node.name?.value === name),
          `Native AX tree missing ${role} "${name}"`);
      }
      const [containerRole, containerName] = expected[0];
      if (containerRole === 'dialog' || containerRole === 'menu') {
        const container = nodes.find((node) => !node.ignored && node.role?.value === containerRole && node.name?.value === containerName);
        const byId = new Map(nodes.map((node) => [node.nodeId, node]));
        const descendants = new Set();
        const pending = [...(container.childIds || [])];
        while (pending.length) {
          const id = pending.pop();
          if (descendants.has(id)) continue;
          descendants.add(id);
          pending.push(...(byId.get(id)?.childIds || []));
        }
        for (const [role, name] of expected.slice(1)) {
          assert.ok(nodes.some((node) => descendants.has(node.nodeId) && !node.ignored && node.role?.value === role && node.name?.value === name),
            `Native AX ${role} "${name}" must belong to ${containerRole} "${containerName}"`);
        }
      }
    } finally { await session.detach(); }
  }
}

async function verify(page, browserName, scenario, origin) {
  await page.goto(`${origin}/?scenario=${scenario}`);
  if (scenario === 'menus') {
    await semantics(page, browserName, [['button', 'Dropdown trigger'], ['button', 'Context target']]);
    await page.getByRole('button', { name: 'Dropdown trigger' }).focus();
    await focused(page, 'Dropdown trigger');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Dropdown action' }).waitFor();
    await semantics(page, browserName, [['button', 'Dropdown trigger'], ['button', 'Dropdown action']]);
    await page.keyboard.press('Tab');
    await focused(page, 'Dropdown action');
    await page.keyboard.press('Escape');
    await focused(page, 'Dropdown trigger');
    await page.keyboard.press('Space');
    assert.equal(await page.getByRole('button', { name: 'Dropdown trigger' }).getAttribute('aria-expanded'), 'true');
    await page.getByRole('button', { name: 'Outside action' }).click();
    const target = page.getByRole('button', { name: 'Context target' });
    await target.focus();
    await target.click({ button: 'right' });
    await focused(page, 'First menu action');
    await semantics(page, browserName, [['menu', 'Context Menu'], ['menuitem', 'First menu action'], ['menuitem', 'Last menu action']]);
    await page.keyboard.press('ArrowDown');
    await focused(page, 'Last menu action');
    await page.keyboard.press('Escape');
    await focused(page, 'Context target');
    for (const key of ['Shift+F10', 'ContextMenu']) {
      await page.keyboard.press(key);
      await focused(page, 'First menu action');
      await page.keyboard.press('Escape');
      await focused(page, 'Context target');
    }
    await page.getByText('Non-button context target', { exact: true }).focus();
    await page.keyboard.press('Shift+F10');
    await focused(page, 'Non-button menu action');
    await page.keyboard.press('Escape');
    await focused(page, 'Non-button context target');
    return;
  }
  if (scenario === 'popover-autofocus') {
    const trigger = page.getByRole('button', { name: 'Search labels' });
    await trigger.click();
    await focused(page, 'Search');
    await page.keyboard.type('bug');
    assert.equal(await page.getByRole('textbox', { name: 'Search' }).inputValue(), 'bug');
    await semantics(page, browserName, [['dialog', 'Search labels'], ['textbox', 'Search'], ['button', 'Apply']]);
    assert.equal(await trigger.getAttribute('id'), 'search-trigger');
    await page.keyboard.press('Escape');
    await focused(page, 'Search labels');
    return;
  }
  if (scenario === 'triggers') {
    for (const [name, actionRole, action] of [
      ['Native dropdown trigger', 'button', 'Native dropdown action'],
      ['Popover trigger', 'button', 'Popover action'],
      ['Mega menu trigger', 'link', 'Mega menu action'],
      ['Confirm trigger', 'button', 'No'],
    ]) {
      const trigger = page.getByRole('button', { name, exact: true });
      await trigger.focus();
      await page.keyboard.press('Enter');
      await page.getByRole(actionRole, { name: action, exact: true }).waitFor();
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      await semantics(page, browserName, [['button', name], [actionRole, action]]);
      await page.keyboard.press('Tab');
      await focused(page, action);
      await page.keyboard.press('Escape');
      await focused(page, name);
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      await page.keyboard.press('Space');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      await trigger.focus();
      await page.keyboard.press('Space');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    }
    return;
  }
  // Explicit focus makes return-focus checks independent of platform pointer-focus preferences.
  await page.getByRole('button', { name: 'Open trap' }).focus();
  await page.keyboard.press('Enter');
  const first = scenario === 'modal' ? 'Close dialog' : scenario === 'drawer' ? 'Close sidebar' : 'First action';
  await focused(page, first);
  if (scenario === 'basic' || scenario === 'legend' || scenario === 'visible-override' || scenario.startsWith('excluded-')) {
    await semantics(page, browserName, [['dialog', 'Trap dialog'], ['heading', 'Trap heading'], ['button', 'First action'], ['textbox', 'Account name']]);
  } else {
    await semantics(page, browserName, [['dialog', `Test ${scenario}`], ['textbox', `${scenario === 'modal' ? 'Modal' : 'Drawer'} field`]]);
  }
  await page.keyboard.press('Shift+Tab');
  await focused(page, 'Close trap');
  await page.keyboard.press('Tab');
  await focused(page, first);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('input:focus').count(), 1, 'Tab reaches the visible field');
  await page.keyboard.press('Tab');
  await focused(page, 'Close trap');
  await page.keyboard.press('Enter');
  await focused(page, 'Open trap');
}

try {
  await build({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('./focus-accessibility-fixture', import.meta.url)),
    logLevel: 'warn', build: { outDir, emptyOutDir: true },
  });
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
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const browserName of browserNames) {
    assert.ok(engines[browserName], `Unknown browser: ${browserName}`);
    browser = await engines[browserName].launch({ headless: true });
    console.info(`[focus-accessibility] ${browserName} ${browser.version()}`);
    for (const scenario of ['basic', 'legend', 'visible-override', ...['hidden', 'display', 'inert', 'fieldset', 'negative', 'negativeOther', 'input', 'invisible'].map((kind) => `excluded-${kind}`), 'modal', 'drawer', 'menus', 'triggers', 'popover-autofocus']) {
      const page = await browser.newPage({ reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await verify(page, browserName, scenario, origin);
        assert.deepEqual(errors, []);
        console.info(`  PASS ${scenario}`);
      } catch (error) {
        failures.push(`${browserName}/${scenario}: ${error.message}`);
        console.error(`  FAIL ${scenario}: ${error.message}`);
      } finally { await page.close(); }
    }
    await browser.close();
    browser = undefined;
  }
  assert.deepEqual(failures, [], 'Browser regressions must pass');
} finally {
  await browser?.close();
  if (server?.listening) await new Promise((closed) => server.close(closed));
  await rm(outDir, { recursive: true, force: true });
}
