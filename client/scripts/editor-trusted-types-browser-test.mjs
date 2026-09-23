import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { build } from 'vite';

// A production bundle avoids the inline scripts/eval required by dev servers.
// The fixture mounts the real editor and rendered-content components; no app
// server, account, database, or test-only replacement editor is involved.
const fixtureRoot = fileURLToPath(new URL('./editor-trusted-types-fixture', import.meta.url));
const outDir = await mkdtemp(resolve(tmpdir(), 'gravity-editor-trusted-types-'));
const baseCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'";
const trustedTypesCsp = "trusted-types gravity-editor dompurify ProseMirrorClipboard; require-trusted-types-for 'script'";
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const engines = { chromium, firefox, webkit };
const browserNames = (process.env.GRAVITY_TT_TEST_BROWSERS || 'chromium').split(',');
let browser;
let server;

async function paste(editor, html, text = '') {
  return editor.evaluate((element, clipboard) => {
    const clipboardData = new DataTransfer();
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData });
    // Firefox creates its own DataTransfer for synthetic ClipboardEvents, so
    // populate the event's actual clipboard instead of only the constructor input.
    if (clipboard.html) event.clipboardData.setData('text/html', clipboard.html);
    if (clipboard.text) event.clipboardData.setData('text/plain', clipboard.text);
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, { html, text });
}

async function verifyEnforcement(origin) {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/probe`);
    const result = await page.evaluate(() => {
      let rawHtmlRejected = false;
      let unapprovedPolicyRejected = false;
      try { document.createElement('div').innerHTML = '<b>untrusted</b>'; }
      catch (error) { rawHtmlRejected = error instanceof TypeError; }
      try { trustedTypes.createPolicy('unapproved-editor-policy', { createHTML: (html) => html }); }
      catch (error) { unapprovedPolicyRejected = error instanceof TypeError; }
      return { rawHtmlRejected, unapprovedPolicyRejected };
    });
    assert.deepEqual(result, { rawHtmlRejected: true, unapprovedPolicyRejected: true });
  } finally {
    await page.close();
  }
}

async function verifyEditor(origin, fallback, browserName) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.addInitScript((withoutTrustedTypes) => {
      if (withoutTrustedTypes) {
        // Simulate a browser without the API before DOMPurify/ProseMirror load.
        Object.defineProperty(window, 'trustedTypes', { configurable: true, value: undefined });
      }
      window.__editorCspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__editorCspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`);
      });
    }, fallback);
    const response = await page.goto(`${origin}/${fallback ? 'fallback' : 'enforced'}`);
    assert.ok(response?.ok(), 'The fixture must load successfully.');
    const surface = page.locator('.rich-text-editor .rich-text-editor__editor');
    await surface.waitFor({ state: 'visible' });

    const policyResult = await page.evaluate(() => {
      const sanitize = window.__editorTrustedTypesTest.sanitizeTrustedHtml;
      const trusted = sanitize('<p><strong>Safe bold</strong><a href="javascript:alert(1)">unsafe</a><img src="/missing-image" onerror="window.__editorXss = true"><script>window.__editorXss = true</script></p>');
      const target = document.createElement('div');
      target.innerHTML = trusted;
      // Repeated calls also ensure a restrictive CSP doesn't encounter duplicate
      // createPolicy attempts; an empty result must be assignable under enforcement.
      const empty = sanitize('<script>window.__editorXss = true</script>');
      document.createElement('div').innerHTML = empty;
      const emptyInput = sanitize('');
      document.createElement('div').innerHTML = emptyInput;
      return {
        hasApi: typeof window.trustedTypes !== 'undefined',
        isTrustedHtml: Boolean(window.trustedTypes?.isHTML(trusted)),
        isString: typeof trusted === 'string',
        emptyIsTrustedHtml: Boolean(window.trustedTypes?.isHTML(emptyInput)),
        bold: target.querySelector('strong')?.textContent,
        dangerousNodes: target.querySelectorAll('script,iframe,[onerror],[onclick],a[href^="javascript:"]').length,
        empty: String(empty),
      };
    });
    assert.deepEqual(policyResult, {
      hasApi: !fallback, isTrustedHtml: !fallback, isString: fallback, emptyIsTrustedHtml: !fallback,
      bold: 'Safe bold', dangerousNodes: 0, empty: '',
    });

    const rendered = page.getByTestId('rendered-content');
    assert.equal(await rendered.locator('strong').textContent(), 'Rendered bold');
    assert.equal(await rendered.locator('a').getAttribute('href'), 'about:blank');

    // ProseMirror's programmatic paste uses transformPastedHTML, bypassing the
    // DOM paste event handler. Exercise the real hook's independent guard too.
    assert.equal(await page.evaluate(() => window.__editorTrustedTypesTest.pasteHTML('<ol start="3"><li><p>Third item</p></li></ol><hr><p><a href="javascript:window.__editorXss=true">Programmatic link</a><script>window.__editorXss=true</script></p>')), true);
    const programmatic = page.getByTestId('programmatic-editor');
    assert.equal(await programmatic.locator('ol').getAttribute('start'), '3');
    assert.equal(await programmatic.locator('hr').count(), 1);
    assert.equal(await programmatic.locator('script,[onerror],a[href^="javascript:"]').count(), 0);

    await page.waitForFunction(() => typeof window.__editorTrustedTypesTest.dropHTML === 'function');
    for (const closed of [true, false]) {
      const result = await page.evaluate((closedSelection) => {
        const api = window.__editorTrustedTypesTest;
        const clipboard = api.copySelection(closedSelection);
        return { clipboard, ...api.dropHTML(clipboard.html, clipboard.text) };
      }, closed);
      assert.match(result.clipboard.html, new RegExp(`data-pm-slice="${closed ? '0 0' : '1 1'} \\[\\]"`));
      assert.equal(result.prevented, true, 'A drop from the other editor must reach ProseMirror.');
      const paragraphs = result.document.content.map((node) => {
        assert.equal(node.type, 'paragraph');
        return (node.content || []).map((child) => child.text || '').join('');
      });
      if (closed) {
        assert.deepEqual(paragraphs.sort(), ['AB', 'a  b'], 'A closed paragraph must retain its boundaries and repeated spaces.');
      } else {
        assert.deepEqual(paragraphs, ['Aa  bB'], 'An inline selection must merge into the target and retain repeated spaces.');
      }
      assert.equal(result.serialized, result.reloaded, 'Dropped editor content must survive save/reload.');
    }

    const unsafeContexts = [
      '1 1 ["blockquote",null,"list_item",null]',
      '0 0 ["ordered_list",{"order":7},"list_item",null]',
      '0 0 ["ordered_list",{"order":"1e999"}]',
      '0 0 ["ordered_list",{"order":null}]',
      '0 0 ["paragraph",{"href":"javascript:window.__editorXss=true","src":"data:text/html,unsafe"}]',
      '0 0 ["image",{"src":"javascript:window.__editorXss=true"}]',
      '0 0 ["heading",{"level":"script"}]',
      '0 0 {"malformed":"context"}',
      '0 0 [',
      '99999999999999999999999 0 []',
    ];
    for (const metadata of unsafeContexts) {
      const attribute = metadata.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const html = `<p data-pm-slice="${attribute}">Safe context <a href="javascript:window.__editorXss=true">link</a><img src="data:text/html,unsafe" onerror="window.__editorXss=true"></p>`;
      const result = await page.evaluate((untrustedHtml) => window.__editorTrustedTypesTest.dropHTML(untrustedHtml), html);
      assert.equal(result.prevented, true);
      assert.equal(result.serialized, result.reloaded, 'Untrusted slice metadata must not corrupt persisted documents.');
      assert.doesNotMatch(result.serialized, /javascript:|data:text\/html|"order":null|1e999/);
      assert.equal(await page.getByTestId('drop-target').locator('script,[onerror],a[href^="javascript:"],img[src^="data:"]').count(), 0);
    }

    for (const invalidStart of ['abc', '1e999']) {
      const result = await page.evaluate((start) => window.__editorTrustedTypesTest.pasteAndReload(`<ol start="${start}"><li><p>Saved list</p></li></ol>`), invalidStart);
      assert.equal(result.serialized, result.reloaded, 'Malformed ordered-list starts must survive save/reload.');
      const list = JSON.parse(result.reloaded).content.find((node) => node.type === 'ordered_list');
      assert.equal(list?.attrs.order, 1);
      assert.equal(await page.getByTestId('drop-target').locator('li').textContent(), 'Saved list');
    }

    await surface.click();
    await page.keyboard.type('Typed text');
    await page.keyboard.press('ControlOrMeta+a');
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    assert.equal(await surface.locator('strong').textContent(), 'Typed text');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.equal(await surface.locator('strong').count(), 0);
    assert.equal(await surface.textContent(), 'Typed text');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    assert.equal(await surface.locator('strong').textContent(), 'Typed text');

    await surface.fill('');
    assert.equal(await surface.textContent(), '');
    assert.equal(await paste(surface, '<p>Pasted <strong>bold</strong> <em>italic</em><a href="javascript:window.__editorXss=true">unsafe</a><img src="/missing-image" onerror="window.__editorXss=true"><script>window.__editorXss=true</script></p>'), true);
    await surface.getByText('Pasted', { exact: false }).waitFor();
    assert.equal(await surface.locator('strong').textContent(), 'bold');
    assert.equal(await surface.locator('em').textContent(), 'italic');
    assert.equal(await surface.locator('script,[onerror],a[href^="javascript:"]').count(), 0);

    await page.keyboard.press('ControlOrMeta+End');
    assert.equal(await paste(surface, '<script>window.__editorXss=true</script>', 'Plain fallback'), true);
    await surface.getByText('Plain fallback', { exact: false }).waitFor();
    const beforeEmptyPaste = await page.getByTestId('serialized-value').textContent();
    assert.equal(await paste(surface, '<script>window.__editorXss=true</script>'), true);
    assert.equal(await page.getByTestId('serialized-value').textContent(), beforeEmptyPaste);

    await page.keyboard.press('ControlOrMeta+End');
    assert.equal(await paste(surface, '', ' Plain-only paste'), true);
    await surface.getByText('Plain-only paste', { exact: false }).waitFor();
    const finalState = await page.evaluate(() => ({
      xssExecuted: Boolean(window.__editorXss),
      violations: window.__editorCspViolations,
    }));
    assert.equal(finalState.xssExecuted, false);
    assert.deepEqual(finalState.violations, [], 'Editor operations must not violate CSP.');
    assert.deepEqual(errors, [], 'Editor operations must not produce browser errors.');
    console.info(`[editor-trusted-types] ${browserName}: ${fallback ? 'simulated missing-API fallback' : 'native enforcement'} passed: sanitization, rendered content, typing, formatting, undo/redo, clipboard/programmatic paste, cross-editor drops, hostile slice metadata and list save/reload.`);
  } finally {
    await page.close();
  }
}

try {
  await build({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    root: fixtureRoot,
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true },
  });
  const fixtureHtml = await readFile(resolve(outDir, 'index.html'));
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      response.setHeader('Content-Security-Policy', pathname === '/fallback' ? baseCsp : `${baseCsp}; ${trustedTypesCsp}`);
      if (pathname === '/probe') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Trusted Types enforcement probe</title>');
      } else if (pathname === '/enforced' || pathname === '/fallback') {
        response.setHeader('Content-Type', 'text/html');
        response.end(fixtureHtml);
      } else {
        const asset = resolve(outDir, `.${pathname}`);
        if (!asset.startsWith(`${outDir}${sep}`)) throw new Error('Invalid path');
        response.setHeader('Content-Type', mimeTypes[extname(asset)] || 'application/octet-stream');
        response.end(await readFile(asset));
      }
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListening);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const browserName of browserNames) {
    assert.ok(engines[browserName], `Unknown browser: ${browserName}`);
    browser = await engines[browserName].launch({ headless: true });
    await verifyEnforcement(origin);
    await verifyEditor(origin, false, browserName);
    await verifyEditor(origin, true, browserName);
    await browser.close();
    browser = undefined;
  }
} finally {
  await browser?.close();
  if (server?.listening) await new Promise((resolveClosed) => server.close(resolveClosed));
  await rm(outDir, { recursive: true, force: true });
}
