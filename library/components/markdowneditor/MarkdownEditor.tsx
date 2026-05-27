import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu as ReactBubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import { Extension } from '@tiptap/core';
import { Markdown } from 'tiptap-markdown';
import { cn } from '../../utilities';
import { Bold, Italic, Strikethrough, Code, Heading1, Heading2, List } from 'lucide-react';

export interface MarkdownEditorProps {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  singleLine?: boolean;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onSave,
  placeholder = 'Type markdown...',
  minHeight = '120px',
  className = '',
  singleLine = false,
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
      BubbleMenu.configure({
        element: null,
      }),
      ...(singleLine
        ? [
            Extension.create({
              name: 'singleLine',
              addKeyboardShortcuts() {
                return {
                  Enter: () => {
                    this.editor.commands.blur();
                    return true;
                  },
                };
              },
            }),
          ]
        : []),
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
    <div className="markdown-editor-wrapper" style={{ width: '100%', cursor: 'text', position: 'relative' }}>
      {editor && (
        <ReactBubbleMenu
          editor={editor}
          tippyOptions={{ duration: 150, zIndex: 1000 }}
          className="markdown-bubble-menu"
        >
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn('bubble-menu-btn', editor.isActive('bold') ? 'is-active' : '')}
            title="Bold"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn('bubble-menu-btn', editor.isActive('italic') ? 'is-active' : '')}
            title="Italic"
          >
            <Italic size={13} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={cn('bubble-menu-btn', editor.isActive('strike') ? 'is-active' : '')}
            title="Strikethrough"
          >
            <Strikethrough size={13} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={cn('bubble-menu-btn', editor.isActive('code') ? 'is-active' : '')}
            title="Code Inline"
          >
            <Code size={13} />
          </button>
          {!singleLine && (
            <>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={cn('bubble-menu-btn', editor.isActive('heading', { level: 1 }) ? 'is-active' : '')}
                title="Heading 1"
              >
                <Heading1 size={13} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={cn('bubble-menu-btn', editor.isActive('heading', { level: 2 }) ? 'is-active' : '')}
                title="Heading 2"
              >
                <Heading2 size={13} />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={cn('bubble-menu-btn', editor.isActive('bulletList') ? 'is-active' : '')}
                title="Bullet List"
              >
                <List size={13} />
              </button>
            </>
          )}
        </ReactBubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
};
