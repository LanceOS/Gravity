import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { createEmptyRichTextValue, parseRichTextValue, renderRichTextHtml, RichTextEditor, serializeRichTextJson } from '@library';

let lastEditorView: any = null;

vi.mock('prosemirror-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('prosemirror-view')>();

  class FakeEditorView {
    state: any;
    props: any;
    focused = false;
    dom: HTMLElement;

    constructor(mount: HTMLElement, props: any) {
      this.state = props.state;
      this.props = props;
      this.dom = mount;
      lastEditorView = this;

      const surface = document.createElement('div');
      surface.setAttribute('data-testid', 'fake-editor-surface');
      mount.appendChild(surface);
    }

    dispatch = (transaction: any) => {
      this.props.dispatchTransaction(transaction);
    };

    pasteText = vi.fn(() => true);

    updateState(nextState: any) {
      this.state = nextState;
    }

    focus() {
      this.focused = true;
    }

    hasFocus() {
      return this.focused;
    }

    coordsAtPos(pos: number) {
      return {
        left: pos * 10,
        right: pos * 10 + 20,
        top: 120,
        bottom: 140,
      };
    }

    setProps(nextProps: any) {
      this.props = { ...this.props, ...nextProps };
    }

    destroy() {}
  }

  return {
    ...actual,
    EditorView: FakeEditorView,
  };
});

describe('RichTextEditor HTML paste security', () => {
  beforeEach(() => {
    lastEditorView = null;
  });

  function mountEditor() {
    const onChange = vi.fn();
    render(<RichTextEditor value={createEmptyRichTextValue()} onChange={onChange} toolbarMode="none" />);
    expect(lastEditorView).toBeTruthy();
    return { view: lastEditorView, onChange };
  }

  function paste(view: any, html: string, text = '') {
    const event = {
      clipboardData: {
        getData: (type: string) => (type === 'text/html' ? html : type === 'text/plain' ? text : ''),
      },
      preventDefault: vi.fn(),
    };
    let handled = false;
    act(() => {
      handled = view.props.handleDOMEvents.paste(view, event);
    });
    return { handled, event };
  }

  it('sanitizes HTML in the real hook handler while preserving safe formatting', () => {
    const { view, onChange } = mountEditor();
    const { handled, event } = paste(view,
      '<p onclick="alert(1)">Safe <strong>bold</strong> <em>italic</em> '
      + '<a href="javascript:alert(1)">link</a></p><script>alert(1)</script>',
    );

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    expect(view.state.doc.textContent).toBe('Safe bold italic link');
    const rendered = renderRichTextHtml(view.state.doc);
    expect(rendered).toContain('<strong>bold</strong>');
    expect(rendered).toContain('<em>italic</em>');
    expect(rendered).not.toMatch(/onclick|<script|javascript:/i);
  });

  it('consumes fully stripped HTML so ProseMirror cannot retry the original input', () => {
    const { view, onChange } = mountEditor();
    const { handled, event } = paste(view, '<script>alert(1)</script><iframe src="https://evil.test"></iframe>');

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(view.pasteText).not.toHaveBeenCalled();
    expect(view.state.doc.textContent).toBe('');
  });

  it('uses the plain text alternative when all supplied HTML is stripped', () => {
    const { view } = mountEditor();
    const { handled, event } = paste(view, '<script>alert(1)</script>', 'safe clipboard text');

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(view.pasteText).toHaveBeenCalledWith('safe clipboard text', event);
  });

  it('lets ProseMirror handle text-only clipboard data', () => {
    const { view, onChange } = mountEditor();
    const { handled, event } = paste(view, '', 'plain text');

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('retains safe image-only HTML paste', () => {
    const { view, onChange } = mountEditor();
    const { handled } = paste(view, '<img src="https://example.com/image.png" alt="diagram" onerror="alert(1)">');

    expect(handled).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
    expect(view.state.doc.firstChild.firstChild.type.name).toBe('image');
    expect(view.state.doc.firstChild.firstChild.attrs).toMatchObject({
      src: 'https://example.com/image.png', alt: 'diagram',
    });
    expect(renderRichTextHtml(view.state.doc)).not.toContain('onerror');
  });

  it('retains horizontal-rule-only paste instead of treating it as rejected HTML', () => {
    const { view, onChange } = mountEditor();
    const { handled } = paste(view, '<hr onclick="alert(1)">');

    expect(handled).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
    expect(view.state.doc.firstChild.type.name).toBe('horizontal_rule');
    expect(renderRichTextHtml(view.state.doc)).toBe('<hr>');
  });

  it('retains ordered-list numbering in the editor document', () => {
    const { view } = mountEditor();
    const { handled } = paste(view, '<ol start="7"><li><p>Seventh item</p></li></ol>');

    expect(handled).toBe(true);
    expect(view.state.doc.firstChild.type.name).toBe('ordered_list');
    expect(view.state.doc.firstChild.attrs.order).toBe(7);
  });

  it.each([
    ['abc', 1],
    ['1e999', 1],
    ['Infinity', 1],
    ['NaN', 1],
    ['1.5', 1],
    ['2147483648', 1],
    ['-2147483649', 1],
    ['-2147483648', -2147483648],
    ['-7', -7],
    ['0', 0],
    ['  +0007  ', 7],
    ['2147483647', 2147483647],
  ])('preserves the document across save/reload after pasting list start %j', (start, expected) => {
    const { view, onChange } = mountEditor();
    const { handled } = paste(view, `<ol start="${start}"><li><p>First item</p></li><li><p>Second item</p></li></ol>`);

    expect(handled).toBe(true);
    expect(view.state.doc.firstChild.type.name).toBe('ordered_list');
    expect(view.state.doc.firstChild.attrs.order).toBe(expected);
    const saved = serializeRichTextJson(view.state.doc);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(saved);
    expect(saved).not.toContain('"order":null');
    const reloaded = parseRichTextValue(saved);
    expect(reloaded.toJSON()).toEqual(view.state.doc.toJSON());
    expect(reloaded.firstChild?.type.name).toBe('ordered_list');
    expect(reloaded.firstChild?.childCount).toBe(2);
    expect(reloaded.textContent).toBe('First itemSecond item');
  });

  it('sanitizes the ProseMirror HTML transform used by drop and programmatic paste', () => {
    const { view } = mountEditor();
    const transformed = view.props.transformPastedHTML(
      '<p onclick="alert(1)">safe</p><script>alert(1)</script><a href="javascript:alert(1)">link</a>',
      view,
    );

    expect(transformed).toBe('<p>safe</p><a>link</a>');
  });
});

describe('RichTextEditor bubble mode', () => {
  beforeEach(() => {
    lastEditorView = null;
  });

  afterEach(() => {
    lastEditorView = null;
  });

  it('shows the markdown bubble when text is selected', async () => {
    render(
      <RichTextEditor
        value={JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Hello world',
                },
              ],
            },
          ],
        })}
        onChange={vi.fn()}
        placeholder="Description"
        toolbarMode="bubble"
      />,
    );

    expect(screen.queryByRole('toolbar', { name: 'Text formatting' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(lastEditorView).toBeTruthy();
    });

    const selection = TextSelection.create(lastEditorView.state.doc, 1, 6);
    lastEditorView.dispatch(lastEditorView.state.tr.setSelection(selection));

    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: 'Text formatting' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
  });
});
