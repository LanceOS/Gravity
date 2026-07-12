import { describe, expect, it } from 'vitest';
import { isSafeHref, sanitizeHtml, safeExternalLinkProps, SAFE_EXTERNAL_LINK_REL } from '@library';

// Re-parse sanitized output into a live DOM subtree. Several XSS classes
// (mutation XSS, HTML-entity smuggling) only reveal themselves once the
// browser re-parses the "safe" string, so string matching alone is not
// enough - we assert against the resulting element tree.
//
// Caveat: this uses jsdom's HTML parser, which is close to but not identical
// to Chrome/Firefox. A green re-parse assertion here is strong evidence, not
// an absolute guarantee across every real-world browser parser.
function parseHtml(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

// True if any element in the subtree carries an inline event-handler
// attribute (onclick, onerror, onload, ...).
function hasEventHandlerAttribute(root: HTMLElement): boolean {
  return Array.from(root.querySelectorAll('*')).some((el) =>
    Array.from(el.attributes).some((attr) => /^on/i.test(attr.name)),
  );
}

describe('sanitizeHtml', () => {
  it('returns an empty string for falsy input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('preserves safe formatting and structure tags', () => {
    const html = '<p>Hello <b>bold</b> <i>italic</i> <em>em</em> <strong>strong</strong></p>'
      + '<ul><li>one</li></ul><ol><li>two</li></ol>'
      + '<code>inline</code><pre>block</pre><blockquote>quote</blockquote>'
      + '<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6><br>';

    const sanitized = sanitizeHtml(html);

    for (const tag of ['<p>', '<b>', '<i>', '<em>', '<strong>', '<ul>', '<li>', '<ol>', '<code>', '<pre>', '<blockquote>', '<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>']) {
      expect(sanitized).toContain(tag);
    }
  });

  it('preserves allowed attributes on a safe external link and image', () => {
    const sanitized = sanitizeHtml('<a href="https://example.com" title="Example" class="link">go</a><img src="https://example.com/x.png" alt="pic" title="t" class="img">');

    expect(sanitized).toContain('href="https://example.com"');
    expect(sanitized).toContain('title="Example"');
    expect(sanitized).toContain('class="link"');
    expect(sanitized).toContain('src="https://example.com/x.png"');
    expect(sanitized).toContain('alt="pic"');
  });

  it('strips dangerous tags entirely', () => {
    const html = '<script>alert(1)</script><style>body{color:red}</style><iframe src="https://evil.com"></iframe>'
      + '<object data="evil.swf"></object><embed src="evil.swf"><form action="/x"><input type="text"></form>';

    const sanitized = sanitizeHtml(html);

    for (const tag of ['<script', '<style', '<iframe', '<object', '<embed', '<form', '<input']) {
      expect(sanitized.toLowerCase()).not.toContain(tag);
    }
  });

  it('strips dangerous event-handler attributes but keeps the element', () => {
    const sanitized = sanitizeHtml('<p onclick="alert(1)" onerror="alert(2)" onload="alert(3)" onmouseover="alert(4)">text</p>');

    expect(sanitized).toContain('text');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('onload');
    expect(sanitized).not.toContain('onmouseover');
  });

  it('blocks javascript:, data:, and vbscript: URI schemes on links', () => {
    const sanitized = sanitizeHtml(
      '<a href="javascript:alert(1)">a</a>'
      + '<a href="data:text/html,<script>alert(1)</script>">b</a>'
      + '<a href="vbscript:msgbox(1)">c</a>',
    );

    expect(sanitized).not.toMatch(/href/);
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('data:');
    expect(sanitized).not.toContain('vbscript:');
  });

  it('blocks a data: URI as an image source', () => {
    const sanitized = sanitizeHtml('<img src="data:image/png;base64,AAAA" alt="x">');

    expect(sanitized).not.toContain('data:image');
  });

  it('forces rel="noopener noreferrer" on links that open in a new tab', () => {
    const sanitized = sanitizeHtml('<a href="https://example.com" target="_blank">go</a>');

    expect(sanitized).toContain('rel="noopener noreferrer"');
    expect(sanitized).toContain('target="_blank"');
  });

  it('forces rel="noopener noreferrer" on absolute external links even without target', () => {
    const sanitized = sanitizeHtml('<a href="https://example.com">go</a>');

    expect(sanitized).toContain('rel="noopener noreferrer"');
    expect(sanitized).toContain('target="_blank"');
  });

  it('does not force target/rel on relative links', () => {
    const sanitized = sanitizeHtml('<a href="/internal/path">go</a>');

    expect(sanitized).not.toContain('target=');
    expect(sanitized).not.toContain('rel=');
  });

  it('merges required rel tokens into an author-supplied rel instead of overwriting it', () => {
    const sanitized = sanitizeHtml('<a href="https://example.com" target="_blank" rel="me">go</a>');

    expect(sanitized).toMatch(/rel="[^"]*\bme\b[^"]*"/);
    expect(sanitized).toMatch(/rel="[^"]*\bnoopener\b[^"]*"/);
    expect(sanitized).toMatch(/rel="[^"]*\bnoreferrer\b[^"]*"/);
  });

  it('strips href/target/rel/src/alt from tags they do not belong on', () => {
    const sanitizedParagraph = sanitizeHtml('<p src="https://example.com/x.png" target="_blank" alt="y" href="https://example.com" rel="me">text</p>');

    expect(sanitizedParagraph).not.toContain('src=');
    expect(sanitizedParagraph).not.toContain('target=');
    expect(sanitizedParagraph).not.toContain('alt=');
    expect(sanitizedParagraph).not.toContain('href=');
    expect(sanitizedParagraph).not.toContain('rel=');
    expect(sanitizedParagraph).toContain('text');
  });

  it('only keeps src/alt (not href/target/rel) on images', () => {
    const sanitizedImage = sanitizeHtml('<img href="https://example.com" target="_blank" rel="me" src="https://example.com/x.png" alt="pic">');

    expect(sanitizedImage).not.toContain('href=');
    expect(sanitizedImage).not.toContain('target=');
    expect(sanitizedImage).not.toContain('rel=');
    expect(sanitizedImage).toContain('src="https://example.com/x.png"');
    expect(sanitizedImage).toContain('alt="pic"');
  });
});

describe('sanitizeHtml - script injection vectors', () => {
  it('strips an external script tag but keeps surrounding text', () => {
    const sanitized = sanitizeHtml('<script src="https://evil.com/x.js"></script>after');

    expect(sanitized.toLowerCase()).not.toContain('<script');
    expect(sanitized).not.toContain('evil.com');
    expect(sanitized).toContain('after');
  });

  it('strips nested/broken script tags used to survive a naive single-pass strip', () => {
    const sanitized = sanitizeHtml('<div><script><script>alert(1)</script></script></div>');

    expect(sanitized.toLowerCase()).not.toContain('<script');
    expect(sanitized).not.toContain('alert(1)');
    expect(parseHtml(sanitized).querySelector('script')).toBeNull();
  });

  it('does not re-parse into a live <script> element after sanitization', () => {
    // The classic "did the sanitizer just move the payload somewhere the
    // browser re-parses it" check.
    const sanitized = sanitizeHtml('<script src="https://evil.com/x.js"></script><div><script>alert(1)</script></div>');

    expect(parseHtml(sanitized).querySelector('script')).toBeNull();
  });

  it('keeps HTML-entity-encoded markup as inert text, not a live element', () => {
    const sanitized = sanitizeHtml('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');

    // The escaped entities must survive (so the text renders literally)...
    expect(sanitized).toContain('&lt;script&gt;');
    expect(sanitized.toLowerCase()).not.toContain('<script');

    // ...and re-parsing must not resurrect a script element.
    const parsed = parseHtml(sanitized);
    expect(parsed.querySelector('script')).toBeNull();
    expect(parsed.querySelector('p')?.textContent).toBe('<script>alert(1)</script>');
  });
});

describe('sanitizeHtml - event handler attributes', () => {
  it.each([
    'onclick',
    'onerror',
    'onload',
    'onmouseover',
    'onfocus',
    'onchange',
  ])('strips the %s inline handler while keeping the element', (handler) => {
    const sanitized = sanitizeHtml(`<p ${handler}="alert(1)">text</p>`);

    expect(sanitized).toContain('text');
    expect(sanitized.toLowerCase()).not.toContain(handler);
    expect(sanitized).not.toContain('alert(1)');
  });

  it('strips onerror from an image while preserving a safe src', () => {
    const sanitized = sanitizeHtml('<img src="https://example.com/x.png" onerror="alert(1)" alt="x">');

    expect(sanitized).toContain('src="https://example.com/x.png"');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('alert(1)');
  });

  it('leaves no on* attribute anywhere in the re-parsed output', () => {
    const sanitized = sanitizeHtml(
      '<a href="https://example.com" onfocus="a()" onmouseover="b()">l</a>'
      + '<img src="https://example.com/x.png" onerror="c()" alt="x">'
      + '<p onclick="d()">t</p>',
    );

    expect(hasEventHandlerAttribute(parseHtml(sanitized))).toBe(false);
  });
});

describe('sanitizeHtml - disallowed attributes', () => {
  it('strips inline style (a CSS-based injection surface) while keeping the element', () => {
    const sanitized = sanitizeHtml('<p style="color:red;background:url(javascript:alert(1))">text</p>');

    expect(sanitized).toContain('text');
    expect(sanitized).not.toContain('style');
    expect(sanitized).not.toContain('javascript:');
    expect(parseHtml(sanitized).querySelector('p')?.getAttribute('style')).toBeNull();
  });

  it('strips data-* attributes', () => {
    const sanitized = sanitizeHtml('<p data-foo="bar" data-x="y">text</p>');

    expect(sanitized).toContain('text');
    expect(sanitized).not.toContain('data-foo');
    expect(sanitized).not.toContain('data-x');
  });
});

describe('sanitizeHtml - URI scheme filtering', () => {
  it('blocks a javascript: URI on an image source', () => {
    const sanitized = sanitizeHtml('<img src="javascript:alert(1)" alt="x">');

    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('src=');
    expect(sanitized).toContain('alt="x"');
  });

  it('blocks a vbscript: URI on an image source', () => {
    const sanitized = sanitizeHtml('<img src="vbscript:msgbox(1)" alt="x">');

    expect(sanitized).not.toContain('vbscript:');
    expect(sanitized).not.toContain('src=');
  });

  it('blocks case-varied javascript: schemes', () => {
    const sanitized = sanitizeHtml('<a href="JaVaScRiPt:alert(1)">x</a>');

    expect(sanitized).not.toContain('href=');
    expect(sanitized.toLowerCase()).not.toContain('javascript:');
  });

  it.each([
    ['leading whitespace', '  javascript:alert(1)'],
    ['embedded tab', 'java\tscript:alert(1)'],
    ['embedded newline', 'java\nscript:alert(1)'],
  ])('blocks a javascript: URI with %s', (_label, href) => {
    const sanitized = sanitizeHtml(`<a href="${href}">x</a>`);

    expect(sanitized).not.toContain('href=');
    // Collapse whitespace first: the scheme is only dangerous once the browser
    // strips the embedded tab/newline back into a contiguous `javascript:`.
    expect(sanitized.toLowerCase().replace(/\s/g, '')).not.toContain('javascript:');
  });

  it.each([
    ['decimal-entity leading char', '<a href="&#106;avascript:alert(1)">x</a>'],
    ['hex-entity mid-scheme', '<a href="jav&#x61;script:alert(1)">x</a>'],
  ])('blocks entity-encoded javascript: schemes (%s)', (_label, html) => {
    const sanitized = sanitizeHtml(html);

    expect(sanitized).not.toContain('href=');
    expect(sanitized.toLowerCase()).not.toContain('javascript:');
    expect(sanitized).not.toContain('alert(1)');
  });

  it('strips schemes that are harmless but not on the allowlist (tel:)', () => {
    const sanitized = sanitizeHtml('<a href="tel:+15551234">call</a>');

    expect(sanitized).not.toContain('href=');
    expect(sanitized).not.toContain('tel:');
    expect(sanitized).toContain('call');
  });

  it('preserves a mailto: link without forcing target/rel on it', () => {
    const sanitized = sanitizeHtml('<a href="mailto:someone@example.com">mail</a>');

    expect(sanitized).toContain('href="mailto:someone@example.com"');
    expect(sanitized).not.toContain('target=');
    expect(sanitized).not.toContain('rel=');
  });

  it('treats a protocol-relative URL as external and forces safe rel/target', () => {
    const sanitized = sanitizeHtml('<a href="//evil.example/path">x</a>');

    expect(sanitized).toContain('href="//evil.example/path"');
    expect(sanitized).toContain('target="_blank"');
    expect(sanitized).toContain('rel="noopener noreferrer"');
  });

  it('forces safe rel on a relative link that still opts into opening a new tab', () => {
    const sanitized = sanitizeHtml('<a href="/internal/path" target="_blank">x</a>');

    expect(sanitized).toContain('href="/internal/path"');
    expect(sanitized).toContain('target="_blank"');
    expect(sanitized).toContain('rel="noopener noreferrer"');
  });
});

describe('sanitizeHtml - SVG and nested payloads', () => {
  it.each([
    ['svg with onload handler', '<svg onload="alert(1)"><circle r="10"/></svg>'],
    ['svg wrapping a script', '<svg><script>alert(1)</script></svg>'],
    ['svg anchor with xlink:href javascript', '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>'],
    ['svg with animate/set handler', '<svg><animate onbegin="alert(1)" attributeName="x"/></svg>'],
  ])('strips %s entirely', (_label, html) => {
    const sanitized = sanitizeHtml(html);

    expect(sanitized.toLowerCase()).not.toContain('<svg');
    expect(sanitized.toLowerCase()).not.toContain('<script');
    expect(sanitized).not.toContain('alert(1)');
    expect(sanitized).not.toContain('javascript:');

    const parsed = parseHtml(sanitized);
    expect(parsed.querySelector('svg')).toBeNull();
    expect(parsed.querySelector('script')).toBeNull();
    expect(hasEventHandlerAttribute(parsed)).toBe(false);
  });
});

describe('sanitizeHtml - mutation XSS (mXSS) variants', () => {
  it.each([
    ['noscript title breakout', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
    ['mglyph/style breakout', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
    ['nested style breakout', '<style><style/><img src=x onerror=alert(1)>'],
    ['comment breakout', '<!--<img src=x onerror=alert(1)>-->'],
  ])('neutralizes the %s payload after re-parsing', (_label, html) => {
    const parsed = parseHtml(sanitizeHtml(html));

    // Escape-safe mXSS guarantees: re-parsing must not yield a live <script>
    // or any inline event handler. These inspect the live element tree rather
    // than the raw string, so they stay correct even if a future sanitizer
    // neutered the payload by escaping it to inert text - and they hold whether
    // the payload was dropped entirely or a bare element survived, which is
    // what gives the test weight when nothing survives.
    expect(parsed.querySelector('script')).toBeNull();
    expect(hasEventHandlerAttribute(parsed)).toBe(false);

    // Any element that did survive must not carry a dangerous URI scheme.
    parsed.querySelectorAll('[src], [href]').forEach((el) => {
      for (const attr of ['src', 'href'] as const) {
        const uri = (el.getAttribute(attr) ?? '').toLowerCase().replace(/\s/g, '');
        expect(uri).not.toMatch(/^(?:javascript|data|vbscript):/);
      }
    });
  });
});

describe('sanitizeHtml - edge cases', () => {
  it('returns an empty string for null and undefined at runtime', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });

  it('passes plain text through unchanged', () => {
    expect(sanitizeHtml('just some plain text 123')).toBe('just some plain text 123');
  });

  it('repairs malformed/unclosed HTML while still forcing safe link attributes', () => {
    const sanitized = sanitizeHtml('<p><b>bold <a href="https://example.com">link');

    const parsed = parseHtml(sanitized);
    const link = parsed.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
  });

  it('treats a malformed "< img>" (space after bracket) as inert text, not an element', () => {
    const parsed = parseHtml(sanitizeHtml('<< p>>hello<//p>< img src=x onerror=alert(1)>'));

    expect(parsed.querySelector('img')).toBeNull();
    expect(hasEventHandlerAttribute(parsed)).toBe(false);
  });

  it('handles extremely long input: strips the payload and preserves the bulk text', () => {
    const filler = 'a'.repeat(200_000);
    const sanitized = sanitizeHtml(`<p>${filler}<script>alert(1)</script></p>`);

    expect(sanitized.toLowerCase()).not.toContain('<script');
    expect(sanitized).not.toContain('alert(1)');
    expect(sanitized).toContain(filler);
  });

  it('is idempotent: sanitizing already-sanitized output changes nothing', () => {
    const once = sanitizeHtml('<a href="https://example.com" target="_blank" rel="me">go</a><p onclick="x()">t</p>');
    const twice = sanitizeHtml(once);

    expect(twice).toBe(once);
  });
});

describe('isSafeHref', () => {
  it('allows http, https, and mailto URLs', () => {
    expect(isSafeHref('https://example.com')).toBe(true);
    expect(isSafeHref('http://example.com')).toBe(true);
    expect(isSafeHref('mailto:someone@example.com')).toBe(true);
  });

  it('allows relative, fragment, and protocol-relative URLs', () => {
    expect(isSafeHref('/internal/path')).toBe(true);
    expect(isSafeHref('#section')).toBe(true);
    expect(isSafeHref('//example.com/path')).toBe(true);
  });

  it('rejects javascript:, data:, and vbscript: schemes', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeHref('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects javascript: regardless of case or embedded whitespace', () => {
    expect(isSafeHref('JAVASCRIPT:alert(1)')).toBe(false);
    expect(isSafeHref('  javascript:alert(1)')).toBe(false);
    expect(isSafeHref('java\tscript:alert(1)')).toBe(false);
    expect(isSafeHref('java\nscript:alert(1)')).toBe(false);
  });

  it('rejects harmless-but-non-allowlisted schemes (tel:)', () => {
    expect(isSafeHref('tel:+15551234')).toBe(false);
  });

  it('rejects empty, null, and undefined hrefs', () => {
    expect(isSafeHref('')).toBe(false);
    expect(isSafeHref(null as unknown as string)).toBe(false);
    expect(isSafeHref(undefined as unknown as string)).toBe(false);
  });
});

describe('safeExternalLinkProps', () => {
  it('forces target="_blank" and rel="noopener noreferrer" on every link', () => {
    expect(SAFE_EXTERNAL_LINK_REL).toBe('noopener noreferrer');
    const props = safeExternalLinkProps('https://example.com');
    expect(props.target).toBe('_blank');
    expect(props.rel).toBe('noopener noreferrer');
  });

  it('passes through safe http, https, and mailto URLs unchanged', () => {
    expect(safeExternalLinkProps('https://example.com/docs').href).toBe('https://example.com/docs');
    expect(safeExternalLinkProps('http://example.com').href).toBe('http://example.com');
    expect(safeExternalLinkProps('mailto:someone@example.com').href).toBe('mailto:someone@example.com');
  });

  it('passes through relative and fragment URLs unchanged', () => {
    expect(safeExternalLinkProps('/internal/path').href).toBe('/internal/path');
    expect(safeExternalLinkProps('#section').href).toBe('#section');
  });

  it('replaces dangerous schemes with the fallback href', () => {
    expect(safeExternalLinkProps('javascript:alert(1)').href).toBe('about:blank');
    expect(safeExternalLinkProps('data:text/html,<script>alert(1)</script>').href).toBe('about:blank');
    expect(safeExternalLinkProps('vbscript:msgbox(1)').href).toBe('about:blank');
    expect(safeExternalLinkProps('  JavaScript:alert(1)').href).toBe('about:blank');
  });

  it('uses about:blank for empty, null, and undefined hrefs by default', () => {
    expect(safeExternalLinkProps('').href).toBe('about:blank');
    expect(safeExternalLinkProps(null).href).toBe('about:blank');
    expect(safeExternalLinkProps(undefined).href).toBe('about:blank');
  });

  it('honors a caller-supplied fallback for unsafe or missing hrefs', () => {
    expect(safeExternalLinkProps('javascript:alert(1)', '#').href).toBe('#');
    expect(safeExternalLinkProps(undefined, '#').href).toBe('#');
    // A safe href is still returned even when a fallback is provided.
    expect(safeExternalLinkProps('https://example.com', '#').href).toBe('https://example.com');
  });
});
