import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react';
import { chainCommands, createParagraphNear, lift, liftEmptyBlock, newlineInCode, setBlockType, splitBlockKeepMarks, toggleMark, wrapIn } from 'prosemirror-commands';
import { Node as ProseMirrorNode, DOMParser as ProseMirrorDOMParser } from 'prosemirror-model';
import { EditorState, type Command, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { history, redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { liftListItem, sinkListItem, splitListItemKeepMarks, wrapInList } from 'prosemirror-schema-list';
import { baseKeymap } from 'prosemirror-commands';
import { cn } from '../../utilities/cn';
import {
  parseRichTextValue,
  richTextSchema,
  serializeRichTextJson,
} from '../../utilities/richtext';
import { sanitizeHtml } from '../../utilities/sanitizeHtml';
import './RichTextEditor.css';

export interface RichTextEditorHandle {
  focus: () => void;
  insertImage: (attrs: { src: string; alt?: string; title?: string }) => void;
}

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string | number;
  autoFocus?: boolean;
  readOnly?: boolean;
  onBlur?: () => void;
}

function normalizeSize(value?: string | number) {
  if (typeof value === 'number') {
    return `${value}px`;
  }

  return value || '180px';
}

function isSameNodeTypeActive(state: EditorState, nodeTypeName: string, attrs?: Record<string, unknown>) {
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to);
  if (!range) {
    return false;
  }

  for (let depth = range.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== nodeTypeName) {
      continue;
    }

    if (!attrs) {
      return true;
    }

    return Object.entries(attrs).every(([key, value]) => node.attrs[key] === value);
  }

  return false;
}

function isMarkActive(state: EditorState, markName: string) {
  const markType = richTextSchema.marks[markName];
  if (!markType) {
    return false;
  }

  const { empty, from, to, $from } = state.selection;
  if (empty) {
    return Boolean(markType.isInSet(state.storedMarks || $from.marks()));
  }

  return state.doc.rangeHasMark(from, to, markType);
}

function isEditorDocumentEmpty(doc: ProseMirrorNode) {
  let hasVisibleContent = false;

  doc.descendants((node) => {
    if (node.isText && node.text && node.text.trim().length > 0) {
      hasVisibleContent = true;
      return false;
    }

    if (node.type.name === 'image' || node.type.name === 'horizontal_rule' || node.type.name === 'hard_break') {
      hasVisibleContent = true;
      return false;
    }

    return true;
  });

  return !hasVisibleContent;
}

function placeholderPlugin(placeholder: string) {
  return new Plugin({
    props: {
      decorations(state) {
        if (!isEditorDocumentEmpty(state.doc)) {
          return null;
        }

        const placeholderEl = document.createElement('span');
        placeholderEl.className = 'rich-text-editor__placeholder';
        placeholderEl.textContent = placeholder;
        return DecorationSet.create(state.doc, [Decoration.widget(1, placeholderEl)]);
      },
    },
  });
}

function buildInputRules() {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, richTextSchema.nodes.heading, (match) => ({
        level: match[1].length,
      })),
      wrappingInputRule(/^\s*>\s$/, richTextSchema.nodes.blockquote),
      wrappingInputRule(/^\s*([-+*])\s$/, richTextSchema.nodes.bullet_list),
      wrappingInputRule(/^(\d+)\.\s$/, richTextSchema.nodes.ordered_list, (match) => ({
        order: Number(match[1]) || 1,
      })),
    ],
  });
}

function toggleHeading(level: number): Command {
  return (state, dispatch) => {
    if (isSameNodeTypeActive(state, 'heading', { level })) {
      return setBlockType(richTextSchema.nodes.paragraph)(state, dispatch);
    }

    return setBlockType(richTextSchema.nodes.heading, { level })(state, dispatch);
  };
}

function toggleBlockQuote(): Command {
  return (state, dispatch) => {
    if (isSameNodeTypeActive(state, 'blockquote')) {
      return lift(state, dispatch);
    }

    return wrapIn(richTextSchema.nodes.blockquote)(state, dispatch);
  };
}

function toggleList(listTypeName: 'bullet_list' | 'ordered_list'): Command {
  return (state, dispatch) => {
    if (isSameNodeTypeActive(state, listTypeName)) {
      return liftListItem(richTextSchema.nodes.list_item)(state, dispatch);
    }

    return wrapInList(richTextSchema.nodes[listTypeName])(state, dispatch);
  };
}

function toggleCodeBlock(): Command {
  return (state, dispatch) => {
    if (isSameNodeTypeActive(state, 'code_block')) {
      return setBlockType(richTextSchema.nodes.paragraph)(state, dispatch);
    }

    return setBlockType(richTextSchema.nodes.code_block)(state, dispatch);
  };
}

function toggleLink(): Command {
  return (state, dispatch) => {
    const linkType = richTextSchema.marks.link;
    if (!linkType) {
      return false;
    }

    const href = window.prompt('Enter link URL', 'https://');
    if (!href) {
      return false;
    }

    return toggleMark(linkType, { href, title: null })(state, dispatch);
  };
}

function toolbarButton(
  label: string,
  title: string,
  icon: ReactNode,
  onClick: () => void,
  active = false,
  disabled = false
) {
  return (
    <button
      key={label}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      className={cn('rich-text-editor__button', active && 'rich-text-editor__button--active')}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  {
    value,
    onChange,
    placeholder = 'Start writing...',
    className,
    minHeight = '180px',
    autoFocus = false,
    readOnly = false,
    onBlur,
  },
  ref,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const serializedValueRef = useRef('');
  const [, setRenderTick] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onBlurRef.current = onBlur;
  }, [onBlur]);

  const plugins = useMemo(() => {
    const enterCommand = chainCommands(
      newlineInCode,
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

  const applyExternalValue = (nextValue: string) => {
    const nextDoc = parseRichTextValue(nextValue);
    const nextSerialized = serializeRichTextJson(nextDoc);
    const view = viewRef.current;

    if (!view || nextSerialized === serializedValueRef.current) {
      return;
    }

    serializedValueRef.current = nextSerialized;
    view.updateState(
      EditorState.create({
        schema: richTextSchema,
        doc: nextDoc,
        plugins,
      }),
    );
    setRenderTick((tick) => tick + 1);
  };

  useEffect(() => {
    if (!mountRef.current || viewRef.current) {
      return;
    }

    const initialDoc = parseRichTextValue(value);
    const initialSerialized = serializeRichTextJson(initialDoc);
    serializedValueRef.current = initialSerialized;

    const view = new EditorView(mountRef.current, {
      state: EditorState.create({
        schema: richTextSchema,
        doc: initialDoc,
        plugins,
      }),
      editable: () => !readOnly,
      dispatchTransaction(transaction) {
        const currentView = viewRef.current;
        if (!currentView) {
          return;
        }

        const nextState = currentView.state.apply(transaction);
        currentView.updateState(nextState);

        if (transaction.docChanged) {
          const nextSerialized = serializeRichTextJson(nextState.doc);
          serializedValueRef.current = nextSerialized;
          onChangeRef.current(nextSerialized);
        }

        setRenderTick((tick) => tick + 1);
      },
      handleDOMEvents: {
        blur: () => {
          onBlurRef.current?.();
          return false;
        },
        paste: (viewInstance, event) => {
          const html = event.clipboardData?.getData('text/html');
          if (!html) {
            return false;
          }

          const sanitized = sanitizeHtml(html);
          if (!sanitized.trim()) {
            return false;
          }

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
    setRenderTick((tick) => tick + 1);

    if (autoFocus) {
      queueMicrotask(() => {
        viewRef.current?.focus();
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [plugins]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.setProps({
      editable: () => !readOnly,
    });
  }, [readOnly]);

  useEffect(() => {
    applyExternalValue(value);
    // Keep the toolbar state in sync if the parent swaps in a new value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      viewRef.current?.focus();
    },
    insertImage: ({ src, alt, title }) => {
      const view = viewRef.current;
      const imageType = richTextSchema.nodes.image;
      if (!view || !imageType) {
        return;
      }

      view.focus();
      const imageNode: ProseMirrorNode = imageType.createChecked({
        src,
        alt: alt || null,
        title: title || null,
      });
      view.dispatch(view.state.tr.replaceSelectionWith(imageNode).scrollIntoView());
    },
  }), []);

  const viewState = viewRef.current?.state;
  const boldActive = viewState ? isMarkActive(viewState, 'strong') : false;
  const italicActive = viewState ? isMarkActive(viewState, 'em') : false;
  const codeActive = viewState ? isMarkActive(viewState, 'code') : false;
  const linkActive = viewState ? isMarkActive(viewState, 'link') : false;
  const h1Active = viewState ? isSameNodeTypeActive(viewState, 'heading', { level: 1 }) : false;
  const h2Active = viewState ? isSameNodeTypeActive(viewState, 'heading', { level: 2 }) : false;
  const h3Active = viewState ? isSameNodeTypeActive(viewState, 'heading', { level: 3 }) : false;
  const bulletActive = viewState ? isSameNodeTypeActive(viewState, 'bullet_list') : false;
  const orderedActive = viewState ? isSameNodeTypeActive(viewState, 'ordered_list') : false;
  const quoteActive = viewState ? isSameNodeTypeActive(viewState, 'blockquote') : false;
  const blockCodeActive = viewState ? isSameNodeTypeActive(viewState, 'code_block') : false;

  return (
    <div className={cn('rich-text-editor', className)}>
      <div className="rich-text-editor__toolbar" role="toolbar" aria-label="Text formatting">
        <div className="rich-text-editor__group">
          {toolbarButton('bold', 'Bold', <Bold size={14} />, () => {
            if (viewRef.current) {
              toggleMark(richTextSchema.marks.strong)(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, boldActive, readOnly)}
          {toolbarButton('italic', 'Italic', <Italic size={14} />, () => {
            if (viewRef.current) {
              toggleMark(richTextSchema.marks.em)(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, italicActive, readOnly)}
          {toolbarButton('code', 'Inline code', <Code2 size={14} />, () => {
            if (viewRef.current) {
              toggleMark(richTextSchema.marks.code)(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, codeActive, readOnly)}
        </div>

        <div className="rich-text-editor__group">
          {toolbarButton('h1', 'Heading 1', <Heading1 size={14} />, () => {
            if (viewRef.current) {
              toggleHeading(1)(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, h1Active, readOnly)}
          {toolbarButton('h2', 'Heading 2', <Heading2 size={14} />, () => {
            if (viewRef.current) {
              toggleHeading(2)(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, h2Active, readOnly)}
          {toolbarButton('h3', 'Heading 3', <Heading3 size={14} />, () => {
            if (viewRef.current) {
              toggleHeading(3)(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, h3Active, readOnly)}
        </div>

        <div className="rich-text-editor__group">
          {toolbarButton('bullet-list', 'Bullet list', <List size={14} />, () => {
            if (viewRef.current) {
              toggleList('bullet_list')(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, bulletActive, readOnly)}
          {toolbarButton('ordered-list', 'Numbered list', <ListOrdered size={14} />, () => {
            if (viewRef.current) {
              toggleList('ordered_list')(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, orderedActive, readOnly)}
          {toolbarButton('quote', 'Blockquote', <Quote size={14} />, () => {
            if (viewRef.current) {
              toggleBlockQuote()(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, quoteActive, readOnly)}
          {toolbarButton('code-block', 'Code block', <span style={{ fontSize: 12, fontWeight: 700 }}>{'</>'}</span>, () => {
            if (viewRef.current) {
              toggleCodeBlock()(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, blockCodeActive, readOnly)}
        </div>

        <div className="rich-text-editor__group">
          {toolbarButton('link', 'Link', <Link2 size={14} />, () => {
            if (viewRef.current) {
              toggleLink()(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, linkActive, readOnly)}
          {toolbarButton('undo', 'Undo', <Undo2 size={14} />, () => {
            if (viewRef.current) {
              undo(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, false, readOnly || !viewState || undoDepth(viewState) === 0)}
          {toolbarButton('redo', 'Redo', <Redo2 size={14} />, () => {
            if (viewRef.current) {
              redo(viewRef.current.state, viewRef.current.dispatch);
              viewRef.current.focus();
            }
          }, false, readOnly || !viewState || redoDepth(viewState) === 0)}
        </div>
      </div>

      <div className="rich-text-editor__content">
        <div ref={mountRef} className="rich-text-editor__mount" />
      </div>
    </div>
  );
});
