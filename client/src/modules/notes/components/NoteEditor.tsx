import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, ImageIcon } from 'lucide-react';
import {
  RichTextEditor,
  type RichTextEditorHandle,
  createEmptyRichTextValue,
  isRichTextDocumentJSON,
} from '@library';
import { useNote } from '../hooks/useNote';
import './NoteEditor.css';

interface NoteEditorProps {
  projectId: string;
  noteId: string;
  onTitleChange?: (title: string) => void;
}

function normalizeLegacyNoteBody(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody);
    if (isRichTextDocumentJSON(parsed)) {
      return rawBody;
    }
  } catch {
    // Fall through to legacy markdown cleanup.
  }

  return rawBody.replace(/^# ?\n/, '').trimStart();
}

export function NoteEditor({ projectId, noteId, onTitleChange }: NoteEditorProps) {
  const { note, loading, saving, saveError, savedAt, saveNote, uploadMedia } = useNote(projectId, noteId);

  const [isDragging, setIsDragging] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(createEmptyRichTextValue());
  const titleRef = useRef('');
  const bodyRef = useRef(createEmptyRichTextValue());
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerSave = useCallback(() => {
    if (!note) return;

    const currentBody = bodyRef.current;
    const currentTitle = titleRef.current.trim() || 'Untitled Note';

    if (currentBody !== note.body || currentTitle !== note.title) {
      saveNote({ title: currentTitle, body: currentBody });
    }
  }, [note, saveNote]);

  const triggerSaveRef = useRef(triggerSave);
  useEffect(() => {
    triggerSaveRef.current = triggerSave;
  }, [triggerSave]);

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      triggerSaveRef.current();
    }, 1500);
  }, []);

  const handleFileUpload = async (file: File) => {
    try {
      const url = await uploadMedia(file);
      editorRef.current?.insertImage({ src: url, alt: file.name, title: file.name });
    } catch (err) {
      console.error('Failed to upload file:', err);
    }
  };

  const noteLoaded = useRef(false);
  useEffect(() => {
    noteLoaded.current = false;
    setTitle('');
    titleRef.current = '';
    onTitleChange?.('');
    setBody(createEmptyRichTextValue());
    bodyRef.current = createEmptyRichTextValue();
  }, [noteId, onTitleChange]);

  useEffect(() => {
    if (!note || noteLoaded.current) return;
    noteLoaded.current = true;

    const nextTitle = note.title ?? '';
    const nextBody = normalizeLegacyNoteBody(note.body ?? createEmptyRichTextValue());

    setTitle(nextTitle);
    titleRef.current = nextTitle;
    onTitleChange?.(nextTitle);
    setBody(nextBody);
    bodyRef.current = nextBody;
  }, [note, onTitleChange]);



  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    titleRef.current = newTitle;
    onTitleChange?.(newTitle);
    scheduleSave();
  };

  const handleBodyChange = (value?: string) => {
    const newBody = value || createEmptyRichTextValue();
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
      </div>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*,.svg"
        onChange={handleFileChange}
      />

      <div className="note-editor__content">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            className="note-editor__title-input"
            placeholder="Title..."
            value={title}
            onChange={handleTitleChange}
            style={{ flex: 1 }}
          />
        </div>

        <RichTextEditor
          ref={editorRef}
          value={body}
          onChange={handleBodyChange}
          placeholder="Write your notes..."
          minHeight="calc(100vh - 200px)"
          toolbarMode="bubble"
          surface='bare'
        />

        <div className={`note-editor__drag-overlay ${isDragging ? 'note-editor__drag-overlay--active' : ''}`}>
          <div className="note-editor__drag-message">
            Drop image to attach
          </div>
        </div>
      </div>
    </div>
  );
}
