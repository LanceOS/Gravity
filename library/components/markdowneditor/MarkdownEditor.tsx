import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { cn } from '../../utilities';

export interface MarkdownEditorProps {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onSave,
  placeholder = 'Type markdown...',
  minHeight = '120px',
  className = ''
}) => {
  const valueRef = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
      Markdown.configure({
        html: false,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn('ProseMirror input-seamless', className),
        style: `min-height: ${minHeight}; outline: none; width: 100%; word-break: break-word;`,
      },
    },
    onBlur: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown();
      if (markdown !== valueRef.current) {
        onSave(markdown);
      }
    },
  });

  // Track external database value changes safely
  useEffect(() => {
    valueRef.current = value;
    if (editor && !editor.isFocused) {
      const currentMarkdown = editor.storage.markdown.getMarkdown();
      if (currentMarkdown !== value) {
        editor.commands.setContent(value);
      }
    }
  }, [value, editor]);

  // Handle global Escape key to blur the active editor session
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editor.isFocused) {
        e.preventDefault();
        editor.commands.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="markdown-editor-wrapper" style={{ width: '100%', cursor: 'text' }}>
      <EditorContent editor={editor} />
    </div>
  );
};
