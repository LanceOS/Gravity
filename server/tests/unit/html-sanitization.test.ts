import { describe, expect, it } from 'vitest';
import {
  isSanitizedEditorContentEmpty,
  sanitizeEditorContent,
} from '../../src/lib/html-sanitization.js';
import { richTextSchema } from '../../src/lib/rich-text-schema.js';

function editorDocument(content: string) {
  return richTextSchema.nodeFromJSON(JSON.parse(content));
}

describe('sanitizeEditorContent', () => {
  it('does not report stripping for an allowed HTML fragment', () => {
    const result = sanitizeEditorContent(
      '<p>Safe <strong>formatting</strong></p><a href="https://example.test">safe link</a>',
    );

    expect(result).toMatchObject({
      format: 'html_or_text',
      stripped: false,
      strippedCount: 0,
    });
    const doc = editorDocument(result.content);
    expect(doc.textContent).toBe('Safe formattingsafe link');
    expect(doc.firstChild?.lastChild?.marks[0]?.type.name).toBe('strong');
    expect(doc.lastChild?.firstChild?.marks[0]?.attrs.href).toBe('https://example.test');
  });

  it('records a script-only payload as stripped for audit monitoring', () => {
    const result = sanitizeEditorContent('<script>alert(1)</script>');

    expect(result).toMatchObject({
      format: 'html_or_text',
      stripped: true,
    });
    expect(result.strippedCount).toBeGreaterThan(0);
    expect(isSanitizedEditorContentEmpty(result.content)).toBe(true);
  });

  it('does not count an image whose unsafe source was stripped as meaningful content', () => {
    const result = sanitizeEditorContent('<img src="javascript:alert(1)" alt="unsafe">');

    expect(result).toMatchObject({
      format: 'html_or_text',
      stripped: true,
    });
    expect(isSanitizedEditorContentEmpty(result.content)).toBe(true);
  });

  it('removes known HTML XSS vectors while retaining allowed formatting', () => {
    const result = sanitizeEditorContent(
      '<p>Safe <strong>formatting</strong></p>'
        + '<script>alert(1)</script>'
        + '<img src="https://images.example.test/safe.png" onerror="alert(2)" alt="safe">'
        + '<a href="java\nscript:alert(3)">unsafe href</a>'
        + '<iframe src="https://evil.example.test/payload"></iframe>',
    );

    expect(result).toMatchObject({
      format: 'html_or_text',
      stripped: true,
    });
    expect(result.strippedCount).toBeGreaterThan(0);
    const doc = editorDocument(result.content);
    expect(doc.textContent).toContain('Safe formatting');
    expect(doc.firstChild?.lastChild?.marks[0]?.type.name).toBe('strong');
    expect(result.content).toContain('"src":"https://images.example.test/safe.png"');
    expect(result.content).toContain('"alt":"safe"');
    expect(result.content.toLowerCase()).not.toContain('<script');
    expect(result.content.toLowerCase()).not.toContain('<iframe');
    expect(result.content.toLowerCase()).not.toContain('onerror=');
    expect(result.content.toLowerCase()).not.toContain('javascript:');
  });

  it.each([
    'Use `<button>` and `List<T>` to submit.',
    '```html\n<script>alert(1)</script>\n<div>Hello</div>\n```',
    '```js\nconst valid = a < b && c > d;\n```',
    'Contact <ada@example.test> or <https://example.test>.',
    'Plain a & b and `a && b` stay intact.',
    '    <script>an indented code example</script>\n',
    '3. third\n4. fourth\n\n---',
  ])('preserves safe Markdown byte-for-byte: %s', (content) => {
    const result = sanitizeEditorContent(content);
    expect(result).toEqual({ content, format: 'markdown', stripped: false, strippedCount: 0 });
    expect(isSanitizedEditorContentEmpty(result.content)).toBe(false);
  });

  it('preserves Markdown code and autolinks next to unsafe HTML', () => {
    const result = sanitizeEditorContent([
      'Use `<button>` and `a && b` with <strong>formatting</strong>.',
      '',
      '<ada@example.test>',
      '',
      '```html',
      '<script>literal code</script>',
      '```',
      '',
      '<script>active payload</script>',
    ].join('\n'));

    expect(result.stripped).toBe(true);
    const doc = editorDocument(result.content);
    expect(doc.textContent).toContain('Use <button> and a && b with formatting.');
    expect(doc.textContent).toContain('ada@example.test');
    expect(doc.textContent).toContain('<script>literal code</script>');
    expect(doc.textContent).not.toContain('active payload');
    expect(doc.firstChild?.content.content.some((node) => node.marks.some((mark) => mark.type.name === 'strong'))).toBe(true);
    expect(doc.content.content.some((node) => node.type.name === 'code_block')).toBe(true);
    expect(doc.content.content.find((node) => node.type.name === 'code_block')?.textContent)
      .toBe('<script>literal code</script>');
  });

  it('retains horizontal rules and ordered-list offsets in mixed HTML and Markdown', () => {
    const result = sanitizeEditorContent('<strong>Intro</strong>\n\n3. third\n4. fourth\n\n---');
    const doc = editorDocument(result.content);
    expect(result.stripped).toBe(false);
    expect(doc.child(1).type.name).toBe('ordered_list');
    expect(doc.child(1).attrs.order).toBe(3);
    expect(doc.lastChild?.type.name).toBe('horizontal_rule');
  });

  it('preserves inline code spacing without adding whitespace around hard breaks', () => {
    const result = sanitizeEditorContent('<strong>Intro</strong> and `a   b`.\n\nA  \nB');
    const doc = editorDocument(result.content);
    expect(doc.firstChild?.textContent).toBe('Intro and a   b.');
    expect(doc.lastChild?.child(1).type.name).toBe('hard_break');
    expect(doc.lastChild?.child(2).text).toBe('B');
  });

  it.each(['foo', 'Infinity', '1e309', '9007199254740992'])('normalizes an invalid list start %s into a usable document', (start) => {
    const result = sanitizeEditorContent(`<ol start="${start}"><li>item</li></ol>`);
    const doc = editorDocument(result.content);
    expect(result.stripped).toBe(true);
    expect(doc.firstChild?.attrs.order).toBe(1);
    expect(doc.textContent).toBe('item');
  });

  it('strips prototype-named HTML attributes without crashing a write', () => {
    const result = sanitizeEditorContent('<p constructor="x" __proto__="x" toString="x">Safe</p>');
    expect(result.stripped).toBe(true);
    expect(editorDocument(result.content).textContent).toBe('Safe');
    expect(result.content).not.toContain('constructor');
  });

  it('removes disallowed Markdown URI schemes while preserving their labels', () => {
    const result = sanitizeEditorContent('[download](ftp://example.test/file)');
    expect(result).toMatchObject({ format: 'markdown', stripped: true, strippedCount: 1 });
    const doc = editorDocument(result.content);
    expect(doc.textContent).toBe('download');
    expect(doc.firstChild?.firstChild?.marks).toEqual([]);
  });

  it('removes an unsafe link mark from persisted ProseMirror JSON without corrupting its text', () => {
    const result = sanitizeEditorContent(JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Keep this label',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'javascript:alert(1)',
                    title: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    }));

    const document = JSON.parse(result.content) as {
      content: Array<{
        content: Array<{
          text: string;
          marks?: Array<{ type: string }>;
        }>;
      }>;
    };

    expect(result).toMatchObject({
      format: 'prosemirror_json',
      stripped: true,
      strippedCount: 1,
    });
    expect(document.content[0]?.content[0]?.text).toBe('Keep this label');
    expect(document.content[0]?.content[0]?.marks).toEqual([]);
    expect(result.content.toLowerCase()).not.toContain('javascript:');
  });

  it('preserves literal HTML-looking text inside valid ProseMirror JSON', () => {
    const literalText = '<script>alert(1)</script> is editor text, not HTML.';
    const input = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: literalText }],
        },
      ],
    });

    const result = sanitizeEditorContent(input);

    expect(result).toEqual({
      content: input,
      format: 'prosemirror_json',
      stripped: false,
      strippedCount: 0,
    });
  });

  it('normalizes a document emptied by an unsafe image into a valid empty document', () => {
    const result = sanitizeEditorContent(JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'java\nscript:alert(1)' },
        },
      ],
    }));

    expect(result).toMatchObject({
      format: 'prosemirror_json',
      stripped: true,
    });
    expect(JSON.parse(result.content)).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    expect(isSanitizedEditorContentEmpty(result.content)).toBe(true);
  });

  it('does not treat retained non-text ProseMirror blocks as empty', () => {
    const result = sanitizeEditorContent(JSON.stringify({
      type: 'doc',
      content: [
        { type: 'horizontal_rule' },
        {
          type: 'image',
          attrs: { src: 'javascript:alert(1)' },
        },
      ],
    }));

    expect(result).toMatchObject({
      format: 'prosemirror_json',
      stripped: true,
    });
    expect(JSON.parse(result.content)).toEqual({
      type: 'doc',
      content: [{ type: 'horizontal_rule' }],
    });
    expect(isSanitizedEditorContentEmpty(result.content)).toBe(false);
  });
});
