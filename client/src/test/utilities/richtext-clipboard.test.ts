import { afterEach, describe, expect, it, vi } from 'vitest';
import DOMPurify from 'dompurify';
import { AllSelection, EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { sanitizeHtml, sanitizeRichTextClipboardHtml, sanitizeTrustedHtml } from '@library/utilities/sanitize';
import { parseRichTextValue, richTextSchema as schema, serializeRichTextJson } from '@library/utilities/richtext';

const views: EditorView[] = [];
const paragraph = (text: string) => schema.node('paragraph', null, schema.text(text));
const cleanClipboard = (html: string) => sanitizeRichTextClipboardHtml(html, schema);

function editor(doc = schema.node('doc', null, [paragraph('AB')]), sanitize = true) {
  const mount = document.body.appendChild(document.createElement('div'));
  const view = new EditorView(mount, {
    state: EditorState.create({ schema, doc }),
    transformPastedHTML: sanitize ? cleanClipboard : undefined,
  });
  views.push(view);
  return view;
}

function paste(view: EditorView, html: string) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
  view.pasteHTML(html, new Event('paste') as ClipboardEvent);
  view.state.doc.check();
  return view.state.doc;
}

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('browser-converted clipboard spaces', () => {
  const chromeUserAgent = 'Mozilla/5.0 AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36';
  const safariUserAgent = 'Mozilla/5.0 AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15';

  it.each([
    ['plain Chrome marker', chromeUserAgent, '<span>&nbsp;</span>', ' '],
    ['Apple marker', safariUserAgent, '<span class="Apple-converted-space">&nbsp;</span>', ' '],
    ['Chrome span with style', chromeUserAgent, '<span style="color: red">&nbsp;</span>', '\u00a0'],
    ['Chrome span with class', chromeUserAgent, '<span class="intentional">&nbsp;</span>', '\u00a0'],
    ['bare NBSP', chromeUserAgent, '&nbsp;', '\u00a0'],
    ['multiple NBSPs', chromeUserAgent, '<span>&nbsp;&nbsp;</span>', '\u00a0\u00a0'],
    ['nested single child', chromeUserAgent, '<span><em>&nbsp;</em></span>', ' '],
    ['multiple children', chromeUserAgent, '<span>&nbsp;<em></em></span>', '\u00a0'],
    ['marker with unsafe attributes', chromeUserAgent, '<span onclick="alert(1)">&nbsp;</span>', ' '],
  ])('preserves ProseMirror whitespace behavior for %s', (_name, userAgent, marker, expected) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    const html = `<p data-pm-slice="1 1 []">one${marker}two</p>`;
    const cleaned = cleanClipboard(html);
    expect(cleaned).not.toMatch(/<span|onclick|style=/);
    const doc = paste(editor(), html);
    expect(doc.textContent).toBe(`Aone${expected}twoB`);
    expect(parseRichTextValue(serializeRichTextJson(doc)).toJSON()).toEqual(doc.toJSON());
    if (_name === 'nested single child') {
      doc.descendants((node) => {
        if (node.isText) expect(node.marks).toHaveLength(0);
      });
    }
  });

  it('does not restore converted spaces when the browser lacks WebKit support', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(chromeUserAgent);
    vi.spyOn(document.documentElement, 'style', 'get').mockReturnValue({} as CSSStyleDeclaration);
    expect(cleanClipboard('<p>one<span>&nbsp;</span>two</p>')).toBe('<p>one&nbsp;two</p>');
  });

  it('ignores form elements with clobbered DOM methods before sanitization', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(chromeUserAgent);
    const html = '<form><input name="matches"><input name="nodeName"></form>'
      + '<p>one<span>&nbsp;</span>two</p>';
    expect(cleanClipboard(html)).toBe('<p>one two</p>');
  });

  it.each([false, true])('keeps generic sanitization unchanged after clipboard processing (throws=%s)', (throws) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(chromeUserAgent);
    const html = '<p>one<span>&nbsp;</span>two</p>';
    if (throws) {
      vi.spyOn(DOMPurify, 'sanitize').mockImplementationOnce(() => { throw new Error('Sanitization failed'); });
      expect(() => cleanClipboard(html)).toThrow('Sanitization failed');
    } else {
      expect(cleanClipboard(html)).toBe('<p>one two</p>');
    }
    expect(sanitizeHtml(html)).toBe('<p>one&nbsp;two</p>');
    expect(String(sanitizeTrustedHtml(html))).toBe('<p>one&nbsp;two</p>');
    expect(cleanClipboard(html)).toBe('<p>one two</p>');
  });
});

describe('sanitized ProseMirror clipboard metadata', () => {
  it.each([true, false])('preserves boundaries and whitespace from a real serialized selection (closed=%s)', (closed) => {
    const source = editor(schema.node('doc', null, [paragraph('a  b')]));
    source.dispatch(source.state.tr.setSelection(closed
      ? new AllSelection(source.state.doc)
      : TextSelection.create(source.state.doc, 1, 5)));
    const html = source.serializeForClipboard(source.state.selection.content()).dom.innerHTML;
    const expected = paste(editor(undefined, false), html);
    const actual = paste(editor(), html);

    expect(actual.toJSON()).toEqual(expected.toJSON());
    expect(actual.textContent).toContain('a  b');
    expect(actual.childCount).toBe(closed ? 3 : 1);
    expect(parseRichTextValue(serializeRichTextJson(actual)).toJSON()).toEqual(actual.toJSON());
  });

  it('preserves serialized nested-list context including the starting number', () => {
    const doc = schema.node('doc', null, [schema.node('blockquote', null, [
      schema.node('ordered_list', { order: 7 }, [schema.node('list_item', null, [paragraph('a  b')])]),
    ])]);
    const source = editor(doc);
    source.dispatch(source.state.tr.setSelection(TextSelection.create(doc, 4, 8)));
    const html = source.serializeForClipboard(source.state.selection.content()).dom.innerHTML;

    expect(cleanClipboard(html)).toContain('data-pm-slice=');
    expect(cleanClipboard(html)).toContain('&quot;order&quot;:7');
    expect(paste(editor(), html).toJSON()).toEqual(paste(editor(undefined, false), html).toJSON());
  });

  it('keeps clipboard metadata out of generic HTML sinks', () => {
    const html = '<p data-pm-slice="0 0 []" data-other="x" onclick="alert(1)">safe</p>';
    expect(sanitizeHtml(html)).toBe('<p>safe</p>');
    expect(String(sanitizeTrustedHtml(html))).toBe('<p>safe</p>');
    expect(cleanClipboard(html)).toBe('<p data-pm-slice="0 0 []">safe</p>');
  });

  it.each([
    '1 1 ["image",{"src":"javascript:alert(1)"}]',
    '1 1 ["heading",{"level":"1 onclick=alert(1)"}]',
    '1 1 ["blockquote",{"href":"javascript:alert(1)"}]',
    '1 1 ["ordered_list",{"order":null},"list_item",null]',
    '1 1 ["ordered_list",{"order":1e999},"list_item",null]',
    '1 1 ["ordered_list",{"order":1.5},"list_item",null]',
    '1 1 ["ordered_list",{"order":2147483648},"list_item",null]',
    '1 1 ["blockquote"]',
    '1 1 {"length":1000000000}',
    '1 1 [invalid]',
    '65 65 []',
    '2 2 []', // Deeper than the sanitized content.
    '1 1 -1 []', // Table wrappers are not part of this schema.
    '0 0 ["blockquote",null,"list_item",null]',
    '1 1 ["blockquote",null,"list_item",null]', // Invalid parent/child nesting.
    '1 1 ["bullet_list",null]', // Cannot wrap a paragraph directly in a list.
    `1 1 ${JSON.stringify(Array.from({ length: 65 }, () => ['blockquote', null]).flat())}`,
  ])('discards invalid metadata without corrupting the document: %s', (metadata) => {
    const html = `<p data-pm-slice='${metadata}'>safe</p>`;
    expect(cleanClipboard(html)).not.toContain('data-pm-slice');
    const doc = paste(editor(), html);
    expect(doc.textContent).toBe('AsafeB');
    expect(parseRichTextValue(serializeRichTextJson(doc)).toJSON()).toEqual(doc.toJSON());
  });

  it('removes nested and duplicate slice markers', () => {
    expect(cleanClipboard('<p>safe <strong data-pm-slice="0 0 []">bold</strong></p>'))
      .not.toContain('data-pm-slice');
    const clean = cleanClipboard('<p data-pm-slice="0 0 []">first</p><p data-pm-slice="0 0 []">second</p>');
    expect(clean.match(/data-pm-slice/g)).toHaveLength(1);
  });
});
