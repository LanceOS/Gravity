import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, queryKeys } from '../../../utils/queryClient';
import type { NoteMetadata } from '../types';

export interface Note extends NoteMetadata {
  body: string;
}

export function useNote(projectId: string, noteId: string | null) {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const noteQuery = useQuery<Note>({
    queryKey: queryKeys.note(noteId || ''),
    queryFn: async () => {
      const response = await fetch(`/api/v1/notes/${noteId}`, {
        headers: {
          'x-project-id': projectId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load note');
      }

      return response.json();
    },
    enabled: !!noteId && !!projectId,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: { title?: string; body?: string }) => {
      const currentNote = noteQuery.data;
      if (!noteId || !currentNote) throw new Error('No active note');

      const response = await fetch(`/api/v1/notes/${noteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-project-id': projectId,
        },
        body: JSON.stringify({
          ...updates,
          version: currentNote.version,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Version conflict. Please refresh the note.');
        }
        throw new Error('Failed to save note');
      }

      return response.json() as Promise<Note>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.note(noteId || ''), updated);
      setSavedAt(new Date());
      setSaveError(null);
      
      // Invalidate the notes list to update title/metadata
      queryClient.invalidateQueries({ queryKey: queryKeys.notes(projectId) });
    },
    onError: (err: Error) => {
      setSaveError(err.message);
    },
  });

  const saveNote = useCallback(async (updates: { title?: string; body?: string }) => {
    await saveMutation.mutateAsync(updates);
  }, [saveMutation]);

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
    return data.url;
  }, [projectId, noteId]);

  return {
    note: noteQuery.data || null,
    loading: noteQuery.isLoading,
    error: noteQuery.error ? (noteQuery.error as Error).message : null,
    saving: saveMutation.isPending,
    saveError,
    savedAt,
    saveNote,
    uploadMedia,
  };
}
