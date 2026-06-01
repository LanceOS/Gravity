import { useState, useEffect, useCallback } from 'react';
import type { NoteMetadata } from '../types';

export interface Note extends NoteMetadata {
  body: string;
}

export function useNote(projectId: string, noteId: string | null) {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const fetchNote = useCallback(async () => {
    if (!noteId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/v1/notes/${noteId}`, {
        headers: {
          'x-project-id': projectId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load note');
      }

      const data = await response.json();
      setNote(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, noteId]);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  const saveNote = useCallback(async (updates: { title?: string; body?: string }) => {
    if (!noteId || !note) return;
    try {
      setSaving(true);
      setSaveError(null);
      
      const response = await fetch(`/api/v1/notes/${noteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-project-id': projectId,
        },
        body: JSON.stringify({
          ...updates,
          version: note.version,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Version conflict. Please refresh the note.');
        }
        throw new Error('Failed to save note');
      }

      const updated = await response.json();
      setNote(updated);
      setSavedAt(new Date());
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }, [projectId, noteId, note]);

  const uploadMedia = useCallback(async (file: File): Promise<string> => {
    if (!noteId) throw new Error('No active note');
    
    const response = await fetch(`/api/v1/notes/${noteId}/media?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: {
        'x-project-id': projectId,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error('Failed to upload media');
    }

    const data = await response.json();
    return data.url; // e.g. /api/v1/notes/:noteId/media/something.png
  }, [projectId, noteId]);

  return {
    note,
    loading,
    error,
    saving,
    saveError,
    savedAt,
    saveNote,
    uploadMedia,
  };
}
