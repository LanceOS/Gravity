import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { RichTextEditor } from '@library';

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
