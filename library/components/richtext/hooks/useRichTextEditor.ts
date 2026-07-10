import { useEffect, useRef, useState, useMemo } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { DOMParser as ProseMirrorDOMParser } from 'prosemirror-model';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, chainCommands, createParagraphNear, liftEmptyBlock, splitBlockKeepMarks, toggleMark } from 'prosemirror-commands';
import { liftListItem, sinkListItem, splitListItemKeepMarks } from 'prosemirror-schema-list';

import { parseRichTextValue, richTextSchema, serializeRichTextJson } from '../../../utilities/richtext';
import { sanitizeHtml } from '../../../utilities/sanitize';
import { cn } from '../../../utilities/cn';
import { buildInputRules, toggleHeading, toggleBlockQuote, toggleList, toggleCodeBlock } from '../utilities/commands';
import { placeholderPlugin } from '../plugins/placeholder';

export interface UseRichTextEditorOptions {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  minHeight?: string | number;
  toolbarMode?: 'full' | 'bubble' | 'none';
}

function normalizeSize(value?: string | number) {
  if (typeof value === 'number') {
    return `${value}px`;
  }
  return value || '180px';
}

export function useRichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Start writing...',
  readOnly = false,
  autoFocus = false,
  minHeight = '180px',
}: UseRichTextEditorOptions) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);

  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const serializedValueRef = useRef('');

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onBlurRef.current = onBlur;
  }, [onBlur]);

  const allPlugins = useMemo(() => {
    const enterCommand = chainCommands(
      createParagraphNear,
      liftEmptyBlock,
      splitListItemKeepMarks(richTextSchema.nodes.list_item),
      splitBlockKeepMarks,
    );

    const customKeymap = keymap({
      Enter: enterCommand,
      'Mod-b': toggleMark(richTextSchema.marks.strong),
      'Mod-i': toggleMark(richTextSchema.marks.em),
      'Mod-`': toggleMark(richTextSchema.marks.code),
      'Mod-Alt-1': toggleHeading(1),
      'Mod-Alt-2': toggleHeading(2),
      'Mod-Alt-3': toggleHeading(3),
      'Mod-Shift-7': toggleList('ordered_list'),
      'Mod-Shift-8': toggleList('bullet_list'),
      'Mod-Shift-9': toggleBlockQuote(),
      'Mod-Alt-c': toggleCodeBlock(),
      Tab: sinkListItem(richTextSchema.nodes.list_item),
      'Shift-Tab': liftListItem(richTextSchema.nodes.list_item),
    });

    return [
      history(),
      buildInputRules(),
      customKeymap,
      keymap(baseKeymap),
      placeholderPlugin(placeholder),
    ];
  }, [placeholder]);

  useEffect(() => {
    // Skip entirely if this value originated from our own dispatchTransaction —
    // the serialized ref is kept in sync by dispatchTransaction, so if they match
    // there is nothing to do and we must NOT touch the editor state (doing so
    // would recreate the EditorState and reset the cursor to position 0).
    if (value === serializedValueRef.current) return;

    const nextDoc = parseRichTextValue(value);
    const nextSerialized = serializeRichTextJson(nextDoc);
    const view = viewRef.current;

    // Double-check after normalizing: if the content is identical to what the
    // editor already has, don't update (handles JSON round-trip normalisation
    // differences that would otherwise cause a spurious cursor reset).
    if (!view || nextSerialized === serializedValueRef.current) return;

    // Also compare against the live doc so we don't clobber in-flight edits
    // that the serialized ref might not yet reflect.
    const currentSerialized = serializeRichTextJson(view.state.doc);
    if (nextSerialized === currentSerialized) {
      // Content is the same — just update our tracking ref and bail.
      serializedValueRef.current = nextSerialized;
      return;
    }

    // Only reach here when an *external* change genuinely differs from what is
    // in the editor (e.g. a different ticket was loaded, or a server sync
    // overwrote the value). Replace the document while preserving the selection
    // as best we can via a transaction instead of a full state recreation.
    serializedValueRef.current = nextSerialized;
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content);
    tr.setMeta('addToHistory', false);
    const nextState = view.state.apply(tr);
    view.updateState(nextState);
    setEditorState(nextState);
  }, [value, allPlugins]);

  useEffect(() => {
    if (!mountRef.current || viewRef.current) return;

    const initialDoc = parseRichTextValue(value);
    const initialSerialized = serializeRichTextJson(initialDoc);
    serializedValueRef.current = initialSerialized;

    const state = EditorState.create({
      schema: richTextSchema,
      doc: initialDoc,
      plugins: allPlugins,
    });

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => !readOnly,
      dispatchTransaction(transaction) {
        const currentView = viewRef.current;
        if (!currentView) return;

        const nextState = currentView.state.apply(transaction);
        currentView.updateState(nextState);
        setEditorState(nextState);

        if (transaction.docChanged) {
          const nextSerialized = serializeRichTextJson(nextState.doc);
          serializedValueRef.current = nextSerialized;
          onChangeRef.current(nextSerialized);
        }
      },
      handleDOMEvents: {
        blur: () => {
          onBlurRef.current?.();
          return false;
        },
        paste: (viewInstance, event) => {
          const html = event.clipboardData?.getData('text/html');
          if (!html) return false;

          const sanitized = sanitizeHtml(html);
          if (!sanitized.trim()) return false;

          event.preventDefault();
          const container = document.createElement('div');
          container.innerHTML = sanitized;
          const slice = ProseMirrorDOMParser.fromSchema(richTextSchema).parseSlice(container);
          viewInstance.dispatch(viewInstance.state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        },
      },
      attributes: {
        class: cn('rich-text-editor__editor'),
        spellcheck: 'true',
        'aria-label': 'Rich text editor',
        style: `--rich-text-editor-min-height: ${normalizeSize(minHeight)};`,
      },
    });

    viewRef.current = view;
    setEditorState(state);

    if (autoFocus) {
      queueMicrotask(() => {
        viewRef.current?.focus();
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlugins]); // Intentionally omitting other deps to prevent recreation

  useEffect(() => {
    viewRef.current?.setProps({ editable: () => !readOnly });
  }, [readOnly]);

  return {
    mountRef,
    view: viewRef.current,
    state: editorState,
  };
}
