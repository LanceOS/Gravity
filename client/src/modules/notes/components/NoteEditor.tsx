import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Strikethrough, Heading1, Heading2,
  List, ListOrdered, Code, Quote, ImageIcon, Network, Check
} from 'lucide-react';
import { useNote } from '../hooks/useNote';
import './NoteEditor.css';

interface NoteEditorProps {
  projectId: string;
  noteId: string;
}

export function NoteEditor({ projectId, noteId }: NoteEditorProps) {
  const { note, loading, saving, saveError, savedAt, saveNote, uploadMedia } = useNote(projectId, noteId);

  const [isDragging, setIsDragging] = useState(false);
  const [title, setTitle] = useState('');
  const titleRef = useRef(title);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      // Trigger save
      triggerSave();
    }, 3000);
  }, []);

  const triggerSave = useCallback(() => {
    if (!editor || !note) return;

    const currentBody = editor.storage.markdown.getMarkdown();
    const currentTitle = titleRef.current.trim() || 'Untitled Note';

    if (currentBody !== note.body || currentTitle !== note.title) {
      saveNote({ title: currentTitle, body: currentBody });
    }
  }, [note, saveNote]);

  const handleFileUpload = async (file: File) => {
    try {
      const url = await uploadMedia(file);
      editor?.chain().focus().setImage({ src: url }).run();
      scheduleSave();
    } catch (err) {
      console.error('Failed to upload file:', err);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Image,
      Placeholder.configure({
        placeholder: 'Body...',
      }),
    ],
    // Explicit document structure so tiptap-markdown never infers a heading node
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: () => {
      scheduleSave();
    },
    editorProps: {
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files[0];
          handleFileUpload(file);
          return true;
        }
        return false;
      }
    }
  }, [noteId]); // Recreate if noteId changes.

  // Sync content when note initially loads
  const noteLoaded = useRef(false);
  useEffect(() => {
    // Reset the loaded flag whenever noteId changes so we reload fresh content.
    noteLoaded.current = false;
  }, [noteId]);

  useEffect(() => {
    if (!note || !editor || noteLoaded.current) return;
    noteLoaded.current = true;

    const rawBody = note.body ?? '';

    // Strip a legacy empty-H1 line written by the old creation code ("# \n\n").
    // We only strip lines that are JUST "# " (no real heading text) so we never
    // destroy intentional user content.
    const cleanedBody = rawBody.replace(/^# ?\n/, '').trimStart();

    if (cleanedBody) {
      editor.commands.setContent(cleanedBody);

      // Belt-and-suspenders: if tiptap-markdown still produced a leading H1
      // node that is empty (a legacy artifact), convert it to a paragraph.
      const json = editor.getJSON();
      const firstNode = json.content?.[0];
      if (firstNode?.type === 'heading' && !firstNode.content?.length) {
        editor.chain()
          .setTextSelection(1)
          .setParagraph()
          .run();
      }
    }

    // Place cursor at the very start of the body.
    editor.commands.focus('start');

    // Populate the title input from stored metadata.
    if (!title && note.title && note.title !== 'Untitled Note') {
      setTitle(note.title);
      titleRef.current = note.title;
    }
  }, [editor, note]);

  // Update scheduleSave closure references
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (!editor || !note) return;
        const currentBody = editor.storage.markdown.getMarkdown();
        const currentTitle = titleRef.current.trim() || 'Untitled Note';

        if (currentBody !== note.body || currentTitle !== note.title) {
          saveNote({ title: currentTitle, body: currentBody });
        }
      }, 3000);
    }
  }, [note, editor, saveNote]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    titleRef.current = newTitle;
    scheduleSave();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    // Drop is handled by TipTap if it happens in the editor,
    // but this covers the entire container.
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  if (loading && !note) {
    return <div className="note-editor" style={{ padding: 24 }}>Loading note...</div>;
  }

  if (!editor) {
    return null;
  }

  return (
    <div
      className="note-editor"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="note-editor__header">
        <div className="note-editor__status">
          {saveError ? (
            <span className="note-editor__status--error">Failed to save: {saveError}</span>
          ) : saving ? (
            <span>Saving...</span>
          ) : savedAt ? (
            <span><Check size={12} style={{ display: 'inline', marginRight: 4 }} /> Saved {savedAt.toLocaleTimeString()}</span>
          ) : null}
        </div>
      </div>

      <div className="note-editor__toolbar">
        <button
          className={`note-editor__toolbar-btn ${editor.isActive('bold') ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          className={`note-editor__toolbar-btn ${editor.isActive('italic') ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          className={`note-editor__toolbar-btn ${editor.isActive('strike') ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough size={16} />
        </button>

        <div className="note-editor__toolbar-divider" />

        <button
          className={`note-editor__toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </button>
        <button
          className={`note-editor__toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </button>

        <div className="note-editor__toolbar-divider" />

        <button
          className={`note-editor__toolbar-btn ${editor.isActive('bulletList') ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        <button
          className={`note-editor__toolbar-btn ${editor.isActive('orderedList') ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >
          <ListOrdered size={16} />
        </button>

        <div className="note-editor__toolbar-divider" />

        <button
          className={`note-editor__toolbar-btn ${editor.isActive('codeBlock') ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code Block"
        >
          <Code size={16} />
        </button>
        <button
          className={`note-editor__toolbar-btn ${editor.isActive('blockquote') ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
        >
          <Quote size={16} />
        </button>

        <div className="note-editor__toolbar-divider" />

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="image/*,.svg"
          onChange={handleFileChange}
        />
        <button
          className="note-editor__toolbar-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach Image"
        >
          <ImageIcon size={16} />
        </button>
        <button
          className="note-editor__toolbar-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach Diagram"
        >
          <Network size={16} />
        </button>
      </div>

      <div className="note-editor__content">
        <input
          type="text"
          className="note-editor__title-input"
          placeholder="Title..."
          value={title}
          onChange={handleTitleChange}
        />
        <EditorContent editor={editor} />

        <div className={`note-editor__drag-overlay ${isDragging ? 'note-editor__drag-overlay--active' : ''}`}>
          <div className="note-editor__drag-message">
            Drop image to attach
          </div>
        </div>
      </div>
    </div>
  );
}
