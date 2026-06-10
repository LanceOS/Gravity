import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import {
  Bold, Italic, Strikethrough, Heading1, Heading2,
  List, ListOrdered, Code, Quote, ImageIcon, Network, Check,
  Link as LinkIcon, Table as TableIcon, Save, Columns, FileText, LayoutTemplate
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
  const [body, setBody] = useState('');
  const titleRef = useRef(title);
  const bodyRef = useRef(body);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  type ViewMode = 'visual' | 'split' | 'markdown';
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [rawMarkdown, setRawMarkdown] = useState('');

  const switchViewMode = (mode: ViewMode) => {
    if (mode !== 'visual' && editor) {
      setRawMarkdown((editor.storage as any).markdown.getMarkdown());
    }
    setViewMode(mode);
  };

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      triggerSave();
    }, 3000);
  }, []);

  const triggerSave = useCallback(() => {
    if (!note) return;

    const currentBody = bodyRef.current;
    const currentTitle = titleRef.current.trim() || 'Untitled Note';

    if (currentBody !== note.body || currentTitle !== note.title) {
      saveNote({ title: currentTitle, body: currentBody });
    }
  }, [note, saveNote]);

  const insertMarkdownAtCursor = (markdownText: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    const newValue = before + markdownText + after;
    setRawMarkdown(newValue);
    bodyRef.current = newValue;

    if (editor) {
      editor.commands.setContent(newValue);
    }

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + markdownText.length;
    }, 0);
  };

  const handleFileUpload = async (file: File) => {
    try {
      const url = await uploadMedia(file);
      const markdownImage = `![${file.name}](${url})`;

      if (viewMode === 'markdown' || viewMode === 'split') {
        insertMarkdownAtCursor(markdownImage);
      } else {
        (editor?.chain().focus() as any).setImage({ src: url }).run();
      }
      scheduleSave();
    } catch (err) {
      console.error('Failed to upload file:', err);
    }
  };

  const handleRawMarkdownChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMarkdown = e.target.value;
    setRawMarkdown(newMarkdown);
    if (editor) {
      const { from, to } = editor.state.selection;
      editor.commands.setContent(newMarkdown);
    }
    bodyRef.current = newMarkdown;
    scheduleSave();
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Image,
      Link.configure({
        openOnClick: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    editable: viewMode !== 'split',
    // Explicit document structure so tiptap-markdown never infers a heading node
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor }) => {
      bodyRef.current = (editor.storage as any).markdown.getMarkdown();
      scheduleSave();
    },
    editorProps: {
      handleDrop: (view: any, event: any, slice: any, moved: boolean) => {
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

  useEffect(() => {
    if (editor) {
      editor.setEditable(viewMode !== 'split');
    }
  }, [viewMode, editor]);

  // Sync content when note initially loads
  const noteLoaded = useRef(false);
  useEffect(() => {
    noteLoaded.current = false;
  }, [noteId]);

  useEffect(() => {
    if (!note || !editor || noteLoaded.current) return;
    noteLoaded.current = true;

    const rawBody = note.body ?? '';
    const cleanedBody = rawBody.replace(/^# ?\n/, '').trimStart();
    
    setBody(cleanedBody);
    bodyRef.current = cleanedBody;
    
    editor.commands.setContent(cleanedBody);
    setRawMarkdown(cleanedBody);

    if (note.title && note.title !== 'Untitled Note') {
      setTitle(note.title);
      titleRef.current = note.title;
    }
  }, [note, editor]);

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        triggerSave();
      }, 3000);
    }
  }, [note, triggerSave]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    titleRef.current = newTitle;
    scheduleSave();
  };

  const handleBodyChange = (value?: string) => {
    const newBody = value || '';
    setBody(newBody);
    bodyRef.current = newBody;
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
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  if (loading && !note) {
    return <div className="note-editor" style={{ padding: 24 }}>Loading note...</div>;
  }

  return (
    <div
      className="note-editor"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-color-mode="dark"
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
        <div className="note-editor__toolbar" style={{ marginBottom: 0, gap: '8px' }}>
          <button
            className="note-editor__toolbar-btn"
            onClick={triggerSave}
            title="Save Now"
            style={{ padding: '4px 8px', gap: '4px' }}
          >
            <Save size={16} /> Save
          </button>
          <div className="note-editor__toolbar-divider" />
          <button
            className={`note-editor__toolbar-btn ${viewMode === 'visual' ? 'note-editor__toolbar-btn--active' : ''}`}
            onClick={() => switchViewMode('visual')}
            title="Visual View"
          >
            <LayoutTemplate size={16} />
          </button>
          <button
            className={`note-editor__toolbar-btn ${viewMode === 'split' ? 'note-editor__toolbar-btn--active' : ''}`}
            onClick={() => switchViewMode('split')}
            title="Split View"
          >
            <Columns size={16} />
          </button>
          <button
            className={`note-editor__toolbar-btn ${viewMode === 'markdown' ? 'note-editor__toolbar-btn--active' : ''}`}
            onClick={() => switchViewMode('markdown')}
            title="Markdown View"
          >
            <FileText size={16} />
          </button>
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
          disabled={viewMode === 'markdown'}
        >
          <Strikethrough size={16} />
        </button>
        <button
          className={`note-editor__toolbar-btn ${editor.isActive('link') ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => {
            if (editor.isActive('link')) {
              (editor.chain().focus() as any).unsetLink().run();
            } else {
              const url = window.prompt('URL');
              if (url) {
                (editor.chain().focus() as any).setLink({ href: url }).run();
              }
            }
          }}
          title="Link"
          disabled={viewMode === 'markdown'}
        >
          <LinkIcon size={16} />
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
          disabled={viewMode === 'markdown'}
        >
          <ListOrdered size={16} />
        </button>

        <div className="note-editor__toolbar-divider" />

        <button
          className={`note-editor__toolbar-btn ${editor.isActive('table') ? 'note-editor__toolbar-btn--active' : ''}`}
          onClick={() => (editor.chain().focus() as any).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Table"
          disabled={viewMode === 'markdown'}
        >
          <TableIcon size={16} />
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
          disabled={viewMode === 'markdown'}
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
          style={viewMode !== 'visual' ? { paddingLeft: 16, paddingTop: 16 } : {}}
        />

        {viewMode === 'visual' && (
          <EditorContent editor={editor} />
        )}

        {viewMode === 'split' && (
          <div className="note-editor__split-container">
            <div className="note-editor__pane note-editor__pane--left" style={{ padding: 16 }}>
              <textarea
                ref={textareaRef}
                className="note-editor__raw-textarea"
                value={rawMarkdown}
                onChange={handleRawMarkdownChange}
                placeholder="Markdown..."
              />
            </div>
            <div className="note-editor__pane note-editor__pane--right" style={{ padding: 16 }}>
              <EditorContent editor={editor} />
            </div>
          </div>
        )}

        {viewMode === 'markdown' && (
          <div className="note-editor__pane" style={{ padding: 16 }}>
            <textarea
              ref={textareaRef}
              className="note-editor__raw-textarea"
              value={rawMarkdown}
              onChange={handleRawMarkdownChange}
              placeholder="Markdown..."
            />
          </div>
        )}

        <div className={`note-editor__drag-overlay ${isDragging ? 'note-editor__drag-overlay--active' : ''}`}>
          <div className="note-editor__drag-message">
            Drop image to attach
          </div>
        </div>
      </div>
    </div>
  );
}
