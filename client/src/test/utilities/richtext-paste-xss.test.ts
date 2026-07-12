import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { DOMParser as ProseMirrorDOMParser, Node as ProseMirrorNode } from 'prosemirror-model';
import {
  createEmptyRichTextDoc,
  extractRichTextPlainText,
  parseRichTextValue,
  renderRichTextHtml,
  richTextSchema,
  sanitizeHtml,
  serializeRichTextJson,
} from '@library';

/**
 * These tests exercise the two real XSS chokepoints of the rich-text editor
 * end-to-end, rather than the `sanitizeHtml` primitive in isolation (which is
 * covered exhaustively in ./sanitize.test.ts):
 *
 *  1. The CLIENT PASTE HANDLER pipeline (`pasteHtmlIntoEditor` below) mirrors
 *     what `useRichTextEditor`'s ProseMirror `handleDOMEvents.paste` does with
 *     pasted clipboard HTML: sanitize the string, parse it into a DOM subtree,
 *     convert that to a ProseMirror slice against the editor schema, and insert
 *     it at the selection. We assert on the ProseMirror document that actually
 *     lands in the editor AND on the HTML it renders back to.
 *
 *  2. The RENDER pipeline (`renderRichTextHtml`) is the enforced XSS boundary
 *     for STORED content. Rich text is persisted as opaque ProseMirror JSON and
 *     the server does not sanitize it, so a document can reach the browser
 *     without ever passing through the paste handler (e.g. written straight to
 *     the API). Those tests feed hand-crafted malicious ProseMirror JSON to the
 *     render path to prove it is neutralized on the way out.
 */

// Reproduces the ProseMirror paste handler in
// library/components/richtext/hooks/useRichTextEditor.ts: sanitize the pasted
// HTML, parse the sanitized string into a slice against the editor schema, and
// insert it into an empty document. Returns the resulting editor document.
function pasteHtmlIntoEditor(html: string): ProseMirrorNode {
  const sanitized = sanitizeHtml(html);
  const state = EditorState.create({ schema: richTextSchema, doc: createEmptyRichTextDoc() });

  // The real handler bails out (returns false) when sanitization leaves nothing
  // to paste, so the editor keeps its existing (empty) document.
  if (!sanitized.trim()) {
    return state.doc;
  }

  const container = document.createElement('div');
  container.innerHTML = sanitized;
  const slice = ProseMirrorDOMParser.fromSchema(richTextSchema).parseSlice(container);
  const next = state.apply(state.tr.replaceSelection(slice));
  return next.doc;
}

// Re-parse an HTML string into a live DOM subtree. Several XSS classes (mXSS,
// entity smuggling) only reveal themselves once the browser re-parses the
// "safe" string, so inspecting the resulting element tree is stronger than
// string matching. Uses jsdom's parser, which is close to but not identical to
// production browsers.
function parseHtml(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

// True if any element in the subtree carries an inline event-handler attribute.
function hasEventHandlerAttribute(root: HTMLElement): boolean {
  return Array.from(root.querySelectorAll('*')).some((el) =>
    Array.from(el.attributes).some((attr) => /^on/i.test(attr.name)),
  );
}

// The core end-to-end guarantee: whatever HTML the render path emits must be
// inert - no executable elements, no inline event handlers, and no dangerous
// URI schemes surviving on any src/href attribute after the browser re-parses.
function assertRenderedHtmlIsInert(html: string): void {
  const parsed = parseHtml(html);

  for (const selector of ['script', 'iframe', 'svg', 'object', 'embed', 'form', 'input', 'style']) {
    expect(parsed.querySelector(selector)).toBeNull();
  }

  expect(hasEventHandlerAttribute(parsed)).toBe(false);

  parsed.querySelectorAll('[src], [href]').forEach((el) => {
    for (const attr of ['src', 'href'] as const) {
      const uri = (el.getAttribute(attr) ?? '').toLowerCase().replace(/\s/g, '');
      expect(uri).not.toMatch(/^(?:javascript|data|vbscript):/);
    }
  });
}

// The stored ProseMirror JSON is what gets sent to the server; assert it never
// carries an inline handler or a dangerous URI scheme in a node/mark attribute.
function assertStoredDocIsClean(doc: ProseMirrorNode): void {
  const json = JSON.stringify(doc.toJSON()).toLowerCase();
  expect(json).not.toMatch(/"on\w+":/);
  expect(json).not.toContain('javascript:');
  expect(json).not.toContain('vbscript:');
  expect(json).not.toContain('data:text/html');
  expect(json).not.toContain('<script');
}

describe('rich text paste pipeline - script injection', () => {
  it('drops an inline script tag but keeps surrounding text', () => {
    const doc = pasteHtmlIntoEditor('<p>before</p><script>alert(1)</script>');

    expect(extractRichTextPlainText(doc)).toContain('before');
    assertStoredDocIsClean(doc);
    assertRenderedHtmlIsInert(renderRichTextHtml(doc));
  });

  it('drops an external script tag but keeps trailing text', () => {
    const doc = pasteHtmlIntoEditor('<script src="https://evil.com/x.js"></script><p>after</p>');

    expect(extractRichTextPlainText(doc)).toContain('after');
    expect(JSON.stringify(doc.toJSON())).not.toContain('evil.com');
    assertRenderedHtmlIsInert(renderRichTextHtml(doc));
  });

  it('drops nested/broken script tags meant to survive a naive single-pass strip', () => {
    const doc = pasteHtmlIntoEditor('<div><script><script>alert(1)</script></script></div>');

    assertStoredDocIsClean(doc);
    assertRenderedHtmlIsInert(renderRichTextHtml(doc));
  });
});

describe('rich text paste pipeline - event handler attributes', () => {
  it.each([
    ['onclick', '<p onclick="alert(1)">text</p>'],
    ['onerror', '<img src="x" onerror="alert(1)">'],
    ['onload', '<p onload="alert(1)">text</p>'],
    ['onmouseover', '<p onmouseover="alert(1)">text</p>'],
    ['onfocus', '<a href="https://example.com" onfocus="alert(1)">text</a>'],
  ])('strips the %s handler through the paste pipeline', (_label, payload) => {
    const doc = pasteHtmlIntoEditor(payload);

    assertStoredDocIsClean(doc);
    assertRenderedHtmlIsInert(renderRichTextHtml(doc));
  });
});

describe('rich text paste pipeline - dangerous URI schemes', () => {
  it.each([
    ['javascript: link', '<a href="javascript:alert(1)">click</a>'],
    ['data:text/html link', '<a href="data:text/html,<script>alert(1)</script>">click</a>'],
    ['vbscript: link', '<a href="vbscript:msgbox(1)">click</a>'],
    ['case-varied javascript: link', '<a href="JaVaScRiPt:alert(1)">click</a>'],
    ['entity-encoded javascript: link', '<a href="&#106;avascript:alert(1)">click</a>'],
  ])('neutralizes a %s so no dangerous href reaches the editor or render', (_label, payload) => {
    const doc = pasteHtmlIntoEditor(payload);

    // The visible link text still survives as plain text...
    expect(extractRichTextPlainText(doc)).toContain('click');
    // ...but the dangerous scheme never makes it into stored JSON or output.
    assertStoredDocIsClean(doc);
    assertRenderedHtmlIsInert(renderRichTextHtml(doc));
  });

  it.each([
    ['javascript: image', '<img src="javascript:alert(1)" alt="x">'],
    ['data:image image', '<img src="data:image/png;base64,AAAA" alt="x">'],
    ['vbscript: image', '<img src="vbscript:msgbox(1)" alt="x">'],
  ])('strips a %s source', (_label, payload) => {
    const doc = pasteHtmlIntoEditor(payload);

    assertStoredDocIsClean(doc);
    assertRenderedHtmlIsInert(renderRichTextHtml(doc));
  });
});

describe('rich text paste pipeline - nested SVG / iframe payloads', () => {
  it.each([
    ['svg with onload', '<svg onload="alert(1)"><circle r="10"/></svg>'],
    ['svg wrapping a script', '<svg><script>alert(1)</script></svg>'],
    ['svg anchor with xlink:href javascript', '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>'],
    ['svg animate handler', '<svg><animate onbegin="alert(1)" attributeName="x"/></svg>'],
    ['iframe with javascript src', '<iframe src="javascript:alert(1)"></iframe>'],
    ['iframe with external src', '<iframe src="https://evil.com/frame"></iframe>'],
  ])('strips a %s entirely', (_label, payload) => {
    const doc = pasteHtmlIntoEditor(payload);

    assertStoredDocIsClean(doc);
    const rendered = renderRichTextHtml(doc);
    expect(rendered).not.toContain('evil.com');
    assertRenderedHtmlIsInert(rendered);
  });
});

describe('rich text paste pipeline - HTML-entity encoding bypasses', () => {
  it('keeps entity-encoded markup as inert text, never a live element', () => {
    const doc = pasteHtmlIntoEditor('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');

    // The escaped markup must survive as literal, visible text - so we do NOT
    // assert the stored JSON is free of the "<script" substring here; it is
    // present precisely because it is inert text content, not an element.
    expect(extractRichTextPlainText(doc)).toContain('<script>alert(1)</script>');

    const rendered = renderRichTextHtml(doc);
    const parsed = parseHtml(rendered);
    expect(parsed.querySelector('script')).toBeNull();
    expect(parsed.textContent).toContain('<script>alert(1)</script>');
    assertRenderedHtmlIsInert(rendered);
  });

  it.each([
    ['decimal-entity leading char', '<a href="&#106;avascript:alert(1)">x</a>'],
    ['hex-entity mid-scheme', '<a href="jav&#x61;script:alert(1)">x</a>'],
  ])('blocks entity-encoded javascript: schemes (%s)', (_label, payload) => {
    const doc = pasteHtmlIntoEditor(payload);

    assertStoredDocIsClean(doc);
    assertRenderedHtmlIsInert(renderRichTextHtml(doc));
  });
});

describe('rich text paste pipeline - mutation XSS (mXSS) variants', () => {
  it.each([
    ['noscript title breakout', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
    ['mglyph/style breakout', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
    ['nested style breakout', '<style><style/><img src=x onerror=alert(1)>'],
    ['comment breakout', '<!--<img src=x onerror=alert(1)>-->'],
    ['malformed spaced img tag', '<< p>>hello<//p>< img src=x onerror=alert(1)>'],
  ])('neutralizes the %s payload through the full pipeline', (_label, payload) => {
    const doc = pasteHtmlIntoEditor(payload);

    assertStoredDocIsClean(doc);

    const parsed = parseHtml(renderRichTextHtml(doc));
    expect(parsed.querySelector('script')).toBeNull();
    expect(parsed.querySelector('img')).toBeNull();
    expect(hasEventHandlerAttribute(parsed)).toBe(false);
  });
});

describe('rich text paste pipeline - safe formatting is preserved', () => {
  it('preserves inline marks (bold, italic, code)', () => {
    const doc = pasteHtmlIntoEditor(
      '<p>Hello <strong>bold</strong> <em>italic</em> <code>snippet</code></p>',
    );

    expect(extractRichTextPlainText(doc)).toBe('Hello bold italic snippet');

    const rendered = renderRichTextHtml(doc);
    expect(rendered).toContain('<strong>bold</strong>');
    expect(rendered).toContain('<em>italic</em>');
    expect(rendered).toContain('<code>snippet</code>');
    assertRenderedHtmlIsInert(rendered);
  });

  it('preserves headings', () => {
    const doc = pasteHtmlIntoEditor('<h1>Launch plan</h1><h2>Details</h2>');

    const rendered = renderRichTextHtml(doc);
    expect(rendered).toContain('<h1>Launch plan</h1>');
    expect(rendered).toContain('<h2>Details</h2>');
  });

  it('preserves bullet and ordered lists', () => {
    const doc = pasteHtmlIntoEditor('<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>');

    const rendered = renderRichTextHtml(doc);
    expect(rendered).toContain('<ul>');
    expect(rendered).toContain('<ol>');
    expect(rendered).toContain('<li>');
    expect(extractRichTextPlainText(doc)).toContain('one');
    expect(extractRichTextPlainText(doc)).toContain('first');
  });

  it('preserves blockquotes and code blocks', () => {
    const doc = pasteHtmlIntoEditor('<blockquote>quote</blockquote><pre><code>code block</code></pre>');

    const rendered = renderRichTextHtml(doc);
    expect(rendered).toContain('<blockquote>');
    expect(rendered).toContain('<pre>');
    expect(extractRichTextPlainText(doc)).toContain('quote');
  });

  it('preserves a safe external link and forces safe rel/target on render', () => {
    const doc = pasteHtmlIntoEditor('<p>Read the <a href="https://example.com/docs">docs</a></p>');

    expect(extractRichTextPlainText(doc)).toContain('docs');

    const rendered = renderRichTextHtml(doc);
    expect(rendered).toContain('href="https://example.com/docs"');
    expect(rendered).toContain('target="_blank"');
    expect(rendered).toContain('rel="noopener noreferrer"');
    assertRenderedHtmlIsInert(rendered);
  });

  it('preserves a safe image while dropping any co-located handler', () => {
    const doc = pasteHtmlIntoEditor('<img src="https://example.com/x.png" alt="pic" onerror="alert(1)">');

    assertStoredDocIsClean(doc);

    const rendered = renderRichTextHtml(doc);
    expect(rendered).toContain('src="https://example.com/x.png"');
    assertRenderedHtmlIsInert(rendered);
  });

  it('keeps a mixed safe + malicious paste: formatting stays, payload goes', () => {
    const doc = pasteHtmlIntoEditor(
      '<h1>Title</h1><p>Safe <strong>text</strong> and a <a href="https://example.com">link</a>.'
      + '<script>alert(1)</script><img src=x onerror=alert(2)></p>',
    );

    expect(extractRichTextPlainText(doc)).toContain('Safe');
    expect(extractRichTextPlainText(doc)).toContain('text');

    const rendered = renderRichTextHtml(doc);
    expect(rendered).toContain('<strong>text</strong>');
    expect(rendered).toContain('href="https://example.com"');
    assertStoredDocIsClean(doc);
    assertRenderedHtmlIsInert(rendered);
  });
});

describe('rich text render pipeline - untrusted stored documents are sanitized', () => {
  // Rich text is stored as ProseMirror JSON and the server never sanitizes it,
  // so a malicious document can reach the render path without going through the
  // paste handler. These craft such documents directly and prove the render
  // path (renderRichTextHtml) is the enforced XSS boundary for stored content.

  function renderStored(doc: unknown): string {
    return renderRichTextHtml(JSON.stringify(doc));
  }

  it('strips a javascript: href stored on a link mark', () => {
    const rendered = renderStored({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)', title: null } }],
            },
          ],
        },
      ],
    });

    expect(rendered).toContain('click');
    expect(rendered.toLowerCase()).not.toContain('javascript:');
    assertRenderedHtmlIsInert(rendered);
  });

  it('strips a data:text/html href stored on a link mark', () => {
    const rendered = renderStored({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'data:text/html,<script>alert(1)</script>', title: null } }],
            },
          ],
        },
      ],
    });

    expect(rendered).toContain('click');
    expect(rendered.toLowerCase()).not.toContain('data:text/html');
    assertRenderedHtmlIsInert(rendered);
  });

  it.each([
    ['javascript: image src', 'javascript:alert(1)'],
    ['data: image src', 'data:image/png;base64,AAAA'],
  ])('strips a %s stored on an image node', (_label, src) => {
    const rendered = renderStored({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { src, alt: 'x', title: null } }],
        },
      ],
    });

    assertRenderedHtmlIsInert(rendered);
  });

  it('escapes raw HTML smuggled into a stored text node instead of executing it', () => {
    const rendered = renderStored({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '<img src=x onerror=alert(1)><script>alert(2)</script>' }],
        },
      ],
    });

    const parsed = parseHtml(rendered);
    expect(parsed.querySelector('img')).toBeNull();
    expect(parsed.querySelector('script')).toBeNull();
    expect(hasEventHandlerAttribute(parsed)).toBe(false);
    // The smuggled markup survives only as inert, visible text.
    expect(parsed.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('preserves a safe stored link while forcing safe rel/target', () => {
    const rendered = renderStored({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'docs',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/docs', title: null } }],
            },
          ],
        },
      ],
    });

    expect(rendered).toContain('href="https://example.com/docs"');
    expect(rendered).toContain('rel="noopener noreferrer"');
    assertRenderedHtmlIsInert(rendered);
  });

  it('renders nothing dangerous for a document built from a malicious JSON string', () => {
    // A full round-trip: parse untrusted JSON, re-serialize, and render.
    const stored = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'link',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)', title: null } }],
            },
          ],
        },
      ],
    });

    const doc = parseRichTextValue(stored);
    const roundTripped = serializeRichTextJson(doc);
    // Re-rendering the re-serialized document is still inert.
    assertRenderedHtmlIsInert(renderRichTextHtml(roundTripped));
  });
});
