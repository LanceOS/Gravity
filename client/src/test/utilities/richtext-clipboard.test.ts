import { afterEach, describe, expect, it } from 'vitest';
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
