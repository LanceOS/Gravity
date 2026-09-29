import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_CONFIGS, queryKeys } from '../../../utils/queryClient';
import { noteSaveQueue } from './noteSaveQueue';
import { ApiError } from '../../../utils/apiClient';
import type { Note } from '../types';
import { notesService, type NotesService } from '../services/notesService';

interface UseNoteOptions {
  notesService?: NotesService;
}

export function useNote(projectId: string, noteId: string | null, { notesService: clientNotesService = notesService }: UseNoteOptions = {}) {
  const client = useQueryClient();
  const queue = noteSaveQueue(client, projectId, noteId || '');
  const saveState = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);

  const noteQuery = useQuery<Note>({
    queryKey: queryKeys.note(noteId || '', projectId),
    queryFn: async () => {
      if (!noteId || !projectId) throw new Error('No active note/project');
      return clientNotesService.getNote(projectId, noteId);
    },
    staleTime: CACHE_CONFIGS.metadata.staleTime,
    enabled: !!noteId && !!projectId,
  });

  const saveNote = useCallback(async (updates: { title?: string; body?: string }, baseVersion?: number, retry = false) => {
    if (!noteId || !projectId || !noteQuery.data) throw new Error('No active note');
    return queue.save(baseVersion ?? noteQuery.data.version, async (version) => {
      const updated = await clientNotesService.updateNote(projectId, noteId, { ...updates, version });
      client.setQueryData(queryKeys.note(noteId, projectId), updated);
      void client.invalidateQueries({ queryKey: queryKeys.notes(projectId) });
      return updated;
    }, retry);
  }, [queue, client, clientNotesService, noteId, projectId, noteQuery.data]);

  const reloadNote = useCallback(async () => {
    if (!noteId || !projectId) throw new Error('No active note');
    return queue.reload(async () => {
      const latest = await clientNotesService.getNote(projectId, noteId);
      client.setQueryData(queryKeys.note(noteId, projectId), latest);
      return latest;
    });
  }, [queue, client, clientNotesService, noteId, projectId]);

  const uploadMedia = useCallback(async (file: File): Promise<string> => {
    if (!noteId || !projectId) throw new Error('No active note');
    const response = await clientNotesService.uploadMedia(projectId, noteId, file);
    return response.url;
  }, [clientNotesService, noteId, projectId]);

  const saveError = saveState.error instanceof ApiError && saveState.error.status === 409
    ? 'Version conflict. Your local edits are preserved. Download your draft before reloading the server version.'
    : saveState.error instanceof Error ? saveState.error.message : saveState.error ? 'Unable to save note' : null;

  return {
    note: noteQuery.data || null,
    loading: noteQuery.isLoading,
    error: noteQuery.isError ? 'Failed to load note' : null,
    saving: saveState.pending > 0,
    saveError,
    savedAt: saveState.savedAt,
    saveNote,
    uploadMedia,
    reloadNote,
  };
}
