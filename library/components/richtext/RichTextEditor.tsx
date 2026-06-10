import { forwardRef, useImperativeHandle } from 'react';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { cn } from '../../utilities/cn';
import { useRichTextEditor } from './hooks/useRichTextEditor';
import { EditorContext } from './context/EditorContext';
import { Toolbar } from './components/Toolbar';
import { BubbleMenu } from './components/BubbleMenu';
import { richTextSchema } from '../../utilities/richtext';
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
  surface?: 'default' | 'compact' | 'bare';
  autoFocus?: boolean;
  readOnly?: boolean;
  onBlur?: () => void;
  toolbarMode?: 'full' | 'bubble' | 'none';
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  {
    value,
    onChange,
    placeholder = 'Start writing...',
    className,
    minHeight = '180px',
    surface = 'default',
    autoFocus = false,
    readOnly = false,
    onBlur,
    toolbarMode = 'full',
  },
  ref,
) {
  const { mountRef, view, state } = useRichTextEditor({
    value,
    onChange,
    placeholder,
    minHeight,
    autoFocus,
    readOnly,
    onBlur,
    toolbarMode,
  });

  useImperativeHandle(ref, () => ({
    focus: () => {
      view?.focus();
    },
    insertImage: ({ src, alt, title }) => {
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
  }), [view]);

  return (
    <EditorContext.Provider value={{ view, state, readOnly, toolbarMode }}>
      <div className={cn('rich-text-editor', `rich-text-editor--${surface}`, className)}>
        {toolbarMode === 'full' && <Toolbar />}
        {toolbarMode === 'bubble' && <BubbleMenu />}
        <div className="rich-text-editor__content">
          <div ref={mountRef} className="rich-text-editor__mount" />
        </div>
      </div>
    </EditorContext.Provider>
  );
});
