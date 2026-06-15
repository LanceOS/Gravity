import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CACHE_CONFIGS, queryKeys } from '../../../utils/queryClient';
import { ApiError } from '../../../utils/apiClient';
import type { Note } from '../types';
import { notesService, type NotesService } from '../services/notesService';

interface UseNoteOptions {
  notesService?: NotesService;
}

export function useNote(projectId: string, noteId: string | null, { notesService: clientNotesService = notesService }: UseNoteOptions = {}) {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const client = useQueryClient();

  const noteQuery = useQuery<Note>({
    queryKey: queryKeys.note(noteId || '', projectId),
    queryFn: async () => {
      if (!noteId || !projectId) throw new Error('No active note/project');
      return clientNotesService.getNote(projectId, noteId);
    },
    onError: () => {
      setLoadError('Failed to load note');
    },
    onSuccess: () => {
      setLoadError(null);
    },
    staleTime: CACHE_CONFIGS.metadata.staleTime,
    enabled: !!noteId && !!projectId,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: { title?: string; body?: string }) => {
      const currentNote = noteQuery.data;
      if (!noteId || !projectId || !currentNote) throw new Error('No active note');

      try {
        return await clientNotesService.updateNote(projectId, noteId, {
          ...updates,
          version: currentNote.version,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          throw new Error('Version conflict. Please refresh the note.');
        }
        throw err;
      }
    },
    onSuccess: (updated) => {
      client.setQueryData(queryKeys.note(noteId || '', projectId), updated);
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
    if (!noteId || !projectId) throw new Error('No active note');

    const response = await clientNotesService.uploadMedia(projectId, noteId, file);

    return response.url;
  }, [clientNotesService, noteId, projectId]);

  return {
    note: noteQuery.data || null,
    loading: noteQuery.isLoading,
    error: loadError || (noteQuery.error ? 'Failed to load note' : null),
    saving: saveMutation.isPending,
    saveError,
    savedAt,
    saveNote,
    uploadMedia,
  };
}
