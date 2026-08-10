import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const targetUrl = process.env.GRAVITY_CSP_TEST_URL;

if (!targetUrl) {
  throw new Error(
    'GRAVITY_CSP_TEST_URL is required (for example, http://localhost:43100).',
  );
}

const applicationUrl = new URL(targetUrl);
const applicationOrigin = applicationUrl.origin;
const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const testEmail = `csp-smoke-${uniqueSuffix}@gravity.test`;
const testPassword = 'CspSmokeTestPassword-123!';
const testWorkspaceKey = `CSP${uniqueSuffix.replace(/[^a-z0-9]/gi, '').slice(-8)}`.toUpperCase();
const testMarker = `CSP browser smoke ${uniqueSuffix}`;

const securityViolationPattern = /(?:content security policy|content-security-policy|trusted types|trustedhtml|require-trusted-types-for|refused to (?:load|execute|apply|create))/i;

function urlFor(pathname) {
  return new URL(pathname, `${applicationOrigin}/`).toString();
}

function assertCspHeader(response) {
  const policy = response.headers()['content-security-policy'];

  assert.ok(policy, 'The production HTML response must include an enforcing CSP header.');
  assert.match(policy, /(?:^|;)\s*script-src\s+'self'(?:\s|;|$)/i);
  assert.match(policy, /(?:^|;)\s*trusted-types\s+[^;]*\bdompurify\b/i);
  assert.match(policy, /(?:^|;)\s*trusted-types\s+[^;]*\bProseMirrorClipboard\b/i);
  assert.match(policy, /(?:^|;)\s*require-trusted-types-for\s+'script'(?:\s|;|$)/i);
}

async function createFixture(page) {
  return page.evaluate(async ({ marker, workspaceKey }) => {
    async function post(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(`${path} returned ${response.status}: ${responseBody?.error ?? response.statusText}`);
      }

      return responseBody;
    }

    const workspaceResponse = await post('/api/v1/workspaces', {
      name: `${marker} workspace`,
      description: 'Fixture for the production CSP browser smoke test.',
      key: workspaceKey,
      hierarchyMode: 'flat',
    });
    const workspace = workspaceResponse.workspace;

    const project = await post('/api/v1/projects', {
      name: `${marker} project`,
      description: 'Fixture project for CSP verification.',
      key: `${workspaceKey}P`,
      status: 'active',
      workspaceId: workspace.id,
    });

    const ticket = await post('/api/v1/tickets', {
      title: `${marker} ticket`,
      description: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
      status: 'todo',
      priority: 'medium',
      projectId: project.id,
      cycleId: null,
      assigneeId: null,
      labelIds: [],
      parentId: null,
    });

    const renderedComment = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `${marker} rendered comment ` },
            {
              type: 'text',
              text: 'unsafe rendered link',
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'javascript:alert(1)', title: null },
                },
              ],
            },
          ],
        },
      ],
    });

    await post(`/api/v1/tickets/${ticket.id}/comments`, { content: renderedComment });

    return {
      workspaceId: workspace.id,
      projectId: project.id,
      ticketKey: ticket.key,
    };
  }, { marker: testMarker, workspaceKey: testWorkspaceKey });
}

async function signUp(page) {
  await page.goto(urlFor('/'), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: "Don't have an account? Sign Up" }).click();
  await page.getByLabel('Full Name').fill('CSP Browser Smoke');
  await page.getByLabel('Email Address').fill(testEmail);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.getByText('Workspace Directory', { exact: true }).waitFor({ state: 'visible' });
}

async function verifyTrustedTypesEnforcement(page) {
  return page.evaluate(() => {
    const target = document.createElement('div');

    try {
      target.innerHTML = '<p>untrusted HTML must be rejected</p>';
      return { blocked: false, errorName: null };
    } catch (error) {
      return {
        blocked: error instanceof TypeError,
        errorName: error instanceof Error ? error.name : String(error),
      };
    }
  });
}

async function pasteRichTextHtml(editor, marker) {
  return editor.evaluate((element, pasteMarker) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData(
      'text/html',
      `<p>${pasteMarker} pasted <strong>rich text</strong><img src="/csp-browser-smoke-image" onerror="window.__cspPasteXss = true"><script>window.__cspPasteXss = true</script></p>`,
    );

    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData,
    });
    element.dispatchEvent(event);

    return { defaultPrevented: event.defaultPrevented };
  }, marker);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const securityViolations = [];
  const pageErrors = [];

  try {
    // Verify that the live server applies the CSP and that Chromium enforces
    // require-trusted-types-for before exercising the application itself.
    const enforcementProbe = await context.newPage();
    const probeResponse = await enforcementProbe.goto(urlFor('/'), { waitUntil: 'domcontentloaded' });
    assert.ok(probeResponse, 'The production application did not return an HTML response.');
    assertCspHeader(probeResponse);

    const enforcement = await verifyTrustedTypesEnforcement(enforcementProbe);
    assert.equal(
      enforcement.blocked,
      true,
      `Trusted Types must reject raw innerHTML assignment (received ${enforcement.errorName ?? 'no error'}).`,
    );
    await enforcementProbe.close();

    const page = await context.newPage();
    page.on('console', (message) => {
      const text = message.text();
      if (securityViolationPattern.test(text)) {
        securityViolations.push(`${message.type()}: ${text}`);
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack || error.message);
    });

    await signUp(page);
    const fixture = await createFixture(page);

    await page.goto(
      urlFor(`/workspaces/${fixture.workspaceId}/projects/${fixture.projectId}/tickets/${fixture.ticketKey}`),
      { waitUntil: 'domcontentloaded' },
    );

    const descriptionEditor = page.locator('.ticket-detail__description-editor .rich-text-editor__editor');
    await descriptionEditor.waitFor({ state: 'visible' });
    await page.getByText(`${testMarker} rendered comment`, { exact: false }).waitFor({ state: 'visible' });

    const unsafeLink = page.getByText('unsafe rendered link', { exact: true });
    await unsafeLink.waitFor({ state: 'visible' });
    const unsafeHref = await unsafeLink.getAttribute('href');
    assert.ok(unsafeHref, 'The rendered rich-text link should have a safe fallback href.');
    assert.doesNotMatch(unsafeHref, /^\s*javascript:/i);

    const pasteMarker = `${testMarker} pasted`;
    const pasteResult = await pasteRichTextHtml(descriptionEditor, pasteMarker);
    assert.equal(pasteResult.defaultPrevented, true, 'The editor must handle HTML paste through its sanitizer.');
    await descriptionEditor.getByText(pasteMarker, { exact: false }).waitFor({ state: 'visible' });

    const pasteSanitization = await descriptionEditor.evaluate((element) => ({
      containsScript: Boolean(element.querySelector('script')),
      containsEventHandler: Array.from(element.querySelectorAll('*')).some((node) =>
        Array.from(node.attributes).some((attribute) => attribute.name.toLowerCase().startsWith('on')),
      ),
      xssExecuted: Boolean(window.__cspPasteXss),
    }));
    assert.equal(pasteSanitization.containsScript, false, 'Pasted script elements must be removed.');
    assert.equal(pasteSanitization.containsEventHandler, false, 'Pasted event handlers must be removed.');
    assert.equal(pasteSanitization.xssExecuted, false, 'Pasted HTML must not execute script or event handlers.');

    // Give browser diagnostics generated by asynchronous React rendering a
    // chance to arrive before declaring the production page clean.
    await page.waitForTimeout(250);
    assert.deepEqual(securityViolations, [], `Unexpected CSP/Trusted Types violation(s):\n${securityViolations.join('\n')}`);
    assert.deepEqual(pageErrors, [], `Unexpected browser error(s):\n${pageErrors.join('\n')}`);

    console.info('[csp-browser-smoke] Production CSP and Trusted Types smoke test passed.');
  } finally {
    await browser.close();
  }
}

await main();
