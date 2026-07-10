import { describe, expect, it } from 'vitest';
import { isSafeHref, sanitizeHtml } from '@library';

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

describe('isSafeHref', () => {
  it('allows http, https, and mailto URLs', () => {
    expect(isSafeHref('https://example.com')).toBe(true);
    expect(isSafeHref('http://example.com')).toBe(true);
    expect(isSafeHref('mailto:someone@example.com')).toBe(true);
  });

  it('allows relative and fragment URLs', () => {
    expect(isSafeHref('/internal/path')).toBe(true);
    expect(isSafeHref('#section')).toBe(true);
  });

  it('rejects javascript:, data:, and vbscript: schemes', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeHref('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects an empty href', () => {
    expect(isSafeHref('')).toBe(false);
  });
});
