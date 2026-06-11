import { describe, expect, it } from 'vitest';
import {
  createEmptyRichTextValue,
  extractRichTextPlainText,
  isRichTextDocumentJSON,
  parseRichTextValue,
  renderRichTextHtml,
  sanitizeHtml,
  serializeRichTextJson,
  serializeRichTextMarkdown,
} from '@library';

describe('rich text utilities', () => {
  it('creates and recognizes the canonical empty ProseMirror document JSON', () => {
    const emptyValue = createEmptyRichTextValue();
    const parsed = JSON.parse(emptyValue);

    expect(isRichTextDocumentJSON(parsed)).toBe(true);
    expect(serializeRichTextJson(emptyValue)).toBe(emptyValue);
    expect(extractRichTextPlainText(emptyValue)).toBe('');
    expect(serializeRichTextMarkdown(emptyValue)).toBe('');
    expect(renderRichTextHtml(emptyValue)).toBe('');
  });

  it('serializes ProseMirror content to markdown and HTML', () => {
    const value = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [
            {
              type: 'text',
              text: 'Launch plan',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Read the ',
            },
            {
              type: 'text',
              text: 'docs',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/docs', title: null } }],
            },
            {
              type: 'text',
              text: ' and ',
            },
            {
              type: 'text',
              text: 'ship',
              marks: [{ type: 'strong' }],
            },
          ],
        },
      ],
    });

    const doc = parseRichTextValue(value);
    const markdown = serializeRichTextMarkdown(doc);
    const html = renderRichTextHtml(doc);

    expect(extractRichTextPlainText(doc)).toBe('Launch plan Read the docs and ship');
    expect(markdown).toContain('# Launch plan');
    expect(markdown).toContain('[docs](https://example.com/docs)');
    expect(markdown).toContain('**ship**');
    expect(html).toContain('<h1>');
    expect(html).toContain('<a href="https://example.com/docs">');
    expect(html).toContain('<strong>ship</strong>');
  });

  it('drops legacy empty heading placeholders from markdown bodies', () => {
    const doc = parseRichTextValue('# \n\nReal body');

    expect(extractRichTextPlainText(doc)).toBe('Real body');
    expect(serializeRichTextMarkdown(doc)).toBe('Real body');
  });

  it('sanitizes pasted HTML through DOMPurify', () => {
    const sanitized = sanitizeHtml('<p onclick="alert(1)">Safe text</p><script>alert(1)</script><a href="javascript:alert(2)">bad</a>');

    expect(sanitized).toContain('Safe text');
    expect(sanitized).not.toContain('onclick=');
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('javascript:alert');
  });
});
