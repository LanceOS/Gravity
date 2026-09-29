import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { Check } from 'lucide-react';
import {
  Button,
  RichTextEditor,
  type RichTextEditorHandle,
  createEmptyRichTextValue,
  isRichTextDocumentJSON,
} from '@library';
import { useNote } from '../hooks/useNote';
import './NoteEditor.css';
import { readDraft, writeDraft, subscribeDraft } from './noteDrafts';

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

export function NoteEditor(props: NoteEditorProps) {
  return <NoteEditorSession key={JSON.stringify([props.projectId, props.noteId])} {...props} />;
}

function NoteEditorSession({ projectId, noteId, onTitleChange }: NoteEditorProps) {
  const { note, loading, saving, saveError, savedAt, saveNote, uploadMedia, reloadNote } = useNote(projectId, noteId);

  const [reloading, setReloading] = useState(false);
  const reloadingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(createEmptyRichTextValue());
  const titleRef = useRef('');
  const bodyRef = useRef(createEmptyRichTextValue());
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const draftKey = note ? `gravity:note-draft:${JSON.stringify([note.userId, projectId, noteId])}` : null;
  const versionRef = useRef<number>(0);
  const draft = useSyncExternalStore(
    useCallback(listener => subscribeDraft(draftKey, listener), [draftKey]),
    useCallback(() => draftKey ? readDraft(draftKey) : null, [draftKey]),
    () => null,
  );
  const dirty = !!draft;
  const [reloadError, setReloadError] = useState<string | null>(null);
  const mounted = useRef(true);
  const pendingRef = useRef<string | null>(null);

  const preserveDraft = () => {
    if (draftKey) writeDraft(draftKey, {
      title: titleRef.current,
      body: bodyRef.current,
      version: readDraft(draftKey)?.version ?? versionRef.current,
    });
  };

  const triggerSave = useCallback((retry = false) => {
    if (!note || !draftKey || reloadingRef.current) return;
    const pendingDraft = readDraft(draftKey);
    if (!pendingDraft) return;
    const updates = { title: pendingDraft.title.trim() || 'Untitled Note', body: pendingDraft.body };
    const snapshot = pendingDraft.revision!;
    if (pendingRef.current === snapshot) return;
    pendingRef.current = snapshot;
    if (mounted.current) setReloadError(null);
    Promise.resolve(saveNote(updates, pendingDraft.version, retry)).then((updated) => {
      if (!updated) return;
      versionRef.current = updated.version;
      const retained = readDraft(draftKey);
      if (retained && retained.revision === pendingDraft.revision) {
        writeDraft(draftKey, null);
      } else if (retained) {
        writeDraft(draftKey, { ...retained, version: updated.version });
      }
      if (mounted.current) setReloadError(null);
    }).catch(() => {
      // The shared save queue exposes the failure; leave the draft intact.
    }).finally(() => {
      if (pendingRef.current === snapshot) pendingRef.current = null;
    });
  }, [note, draftKey, saveNote]);

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
      if (!mounted.current || reloadingRef.current) return;
      editorRef.current?.insertImage({ src: url, alt: file.name, title: file.name });
    } catch (err) {
      console.error('Failed to upload file:', err);
    }
  };

  const noteLoaded = useRef(false);
  useEffect(() => {
    if (!note || noteLoaded.current || !draftKey) return;
    noteLoaded.current = true;
    const draft = readDraft(draftKey);
    const nextTitle = draft?.title ?? note.title ?? '';
    const nextBody = draft?.body ?? normalizeLegacyNoteBody(note.body ?? createEmptyRichTextValue());
    versionRef.current = draft?.version ?? note.version;
    setTitle(nextTitle);
    titleRef.current = nextTitle;
    onTitleChange?.(nextTitle);
    setBody(nextBody);
    bodyRef.current = nextBody;
  }, [note, draftKey, onTitleChange]);

  useEffect(() => {
    // A save started by the previous mount may acknowledge the restored draft.
    // Only advance a clean editor whose contents actually match that version.
    if (!dirty && note && noteLoaded.current
      && (titleRef.current.trim() || 'Untitled Note') === note.title
      && bodyRef.current === normalizeLegacyNoteBody(note.body)) {
      versionRef.current = note.version;
    }
  }, [dirty, note]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      triggerSaveRef.current();
    };
  }, []);

  const downloadDraft = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ title: titleRef.current, body: bodyRef.current }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `note-${noteId}-draft.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const reload = async () => {
    if (!window.confirm('Discard your local edits and load the server version? Download your draft first to keep a copy.')) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    reloadingRef.current = true;
    setReloading(true);
    try {
      const latest = await reloadNote();
      if (!mounted.current) return;
      if (draftKey) writeDraft(draftKey, null);
      titleRef.current = latest.title;
      bodyRef.current = normalizeLegacyNoteBody(latest.body);
      versionRef.current = latest.version;
      setTitle(titleRef.current);
      setBody(bodyRef.current);
      setReloadError(null);
      onTitleChange?.(latest.title);
    } catch (error) {
      if (!mounted.current) return;
      setReloadError(error instanceof Error ? error.message : 'Unable to reload note');
    } finally {
      reloadingRef.current = false;
      if (mounted.current) setReloading(false);
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (reloadingRef.current || !noteLoaded.current) return;
    const newTitle = e.target.value;
    setTitle(newTitle);
    titleRef.current = newTitle;
    onTitleChange?.(newTitle);
    preserveDraft();
    scheduleSave();
  };

  const handleBodyChange = (value?: string) => {
    if (reloadingRef.current || !noteLoaded.current) return;
    const newBody = value || createEmptyRichTextValue();
    setBody(newBody);
    bodyRef.current = newBody;
    preserveDraft();
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
    >
      <div className="note-editor__header">
        <div className="note-editor__status" role="status">
          {reloadError ? (
            <span className="note-editor__status--error">Failed to reload: {reloadError}</span>
          ) : saveError ? (
            <span className="note-editor__status--error">Failed to save: {saveError}</span>
          ) : saving ? (
            <span>Saving...</span>
          ) : dirty ? (
            <span>Unsaved changes — draft retained in this tab</span>
          ) : savedAt ? (
            <span><Check size={12} style={{ display: 'inline', marginRight: 4 }} /> Saved {savedAt.toLocaleTimeString()}</span>
          ) : null}
        </div>
      </div>

      {(dirty || reloadError || saveError) && (
        <div className="note-editor__recovery">
          <Button size="sm" type="button" onClick={() => triggerSave(true)} disabled={saving || reloading}>Retry save</Button>
          <Button size="sm" type="button" onClick={downloadDraft}>Download draft</Button>
          <Button size="sm" type="button" onClick={reload} disabled={saving || reloading}>Reload server version</Button>
        </div>
      )}

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
            aria-label="Note title"
            disabled={!note || reloading}
            value={title}
            onChange={handleTitleChange}
            style={{ flex: 1 }}
          />
        </div>

        <RichTextEditor
          readOnly={!note || reloading}
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
