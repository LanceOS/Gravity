import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CACHE_CONFIGS, queryKeys } from '../../../utils/queryClient';
import { apiClient, ApiError } from '../../../utils/apiClient';
import type { NoteMetadata } from '../types';

export interface Note extends NoteMetadata {
  body: string;
}

export function useNote(projectId: string, noteId: string | null) {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const client = useQueryClient();

  const noteQuery = useQuery<Note>({
    queryKey: queryKeys.note(noteId || ''),
    queryFn: async () => {
      return apiClient.get<Note>(`/notes/${noteId}`, { projectId });
    },
    staleTime: CACHE_CONFIGS.metadata.staleTime,
    enabled: !!noteId && !!projectId,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: { title?: string; body?: string }) => {
      const currentNote = noteQuery.data;
      if (!noteId || !currentNote) throw new Error('No active note');

      try {
        return await apiClient.patch<Note>(
          `/notes/${noteId}`,
          { ...updates, version: currentNote.version },
          { projectId },
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          throw new Error('Version conflict. Please refresh the note.');
        }
        throw err;
      }
    },
    onSuccess: (updated) => {
      client.setQueryData(queryKeys.note(noteId || ''), updated);
      setSavedAt(new Date());
      setSaveError(null);
      
      // Invalidate the notes list to update title/metadata
      client.invalidateQueries({ queryKey: queryKeys.notes(projectId) });
    },
    onError: (err: Error) => {
      setSaveError(err.message);
    },
  });

  const saveNote = useCallback(async (updates: { title?: string; body?: string }) => {
    try {
      await saveMutation.mutateAsync(updates);
    } catch (e) {
      // Ignored here, handled by onError
    }
  }, [saveMutation]);

  const uploadMedia = useCallback(async (file: File): Promise<string> => {
    if (!noteId) throw new Error('No active note');

    const response = await apiClient.postBinary<{ url: string }>(`/notes/${noteId}/media?filename=${encodeURIComponent(file.name)}`, file, {
      projectId,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    });

    return response.url;
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
