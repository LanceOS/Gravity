import { useState, useEffect, useRef, useCallback } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { Check, ImageIcon, Network } from 'lucide-react';
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
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = async (file: File) => {
    try {
      const url = await uploadMedia(file);
      const markdownImage = `![${file.name}](${url})`;
      const newBody = bodyRef.current + '\n' + markdownImage;
      setBody(newBody);
      bodyRef.current = newBody;
      scheduleSave();
    } catch (err) {
      console.error('Failed to upload file:', err);
    }
  };

  const noteLoaded = useRef(false);
  useEffect(() => {
    noteLoaded.current = false;
  }, [noteId]);

  useEffect(() => {
    if (!note || noteLoaded.current) return;
    noteLoaded.current = true;

    const rawBody = note.body ?? '';
    const cleanedBody = rawBody.replace(/^# ?\n/, '').trimStart();
    
    setBody(cleanedBody);
    bodyRef.current = cleanedBody;

    if (!title && note.title && note.title !== 'Untitled Note') {
      setTitle(note.title);
      titleRef.current = note.title;
    }
  }, [note]);

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
      </div>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*,.svg"
        onChange={handleFileChange}
      />

      <div className="note-editor__content">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
          <input
            type="text"
            className="note-editor__title-input"
            placeholder="Title..."
            value={title}
            onChange={handleTitleChange}
            style={{ flex: 1 }}
          />
          <button
            className="note-editor__toolbar-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach Image"
          >
            <ImageIcon size={16} />
          </button>
        </div>
        
        <MDEditor
          value={body}
          onChange={handleBodyChange}
          preview="live"
          height="calc(100vh - 200px)"
          textareaProps={{
             placeholder: 'Write your notes in Markdown...'
          }}
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
