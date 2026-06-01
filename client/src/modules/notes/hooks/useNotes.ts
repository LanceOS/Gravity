import { useState, useEffect, useCallback } from 'react';
import type { NoteMetadata } from '../types';

export function useNotes(projectId: string) {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;

  const fetchNotes = useCallback(async (currentOffset: number = 0, append: boolean = false) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/v1/notes?limit=${limit}&offset=${currentOffset}`, {
        headers: {
          'x-project-id': projectId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load notes');
      }

      const data = await response.json();
      
      setNotes((prev) => (append ? [...prev, ...data] : data));
      setOffset(currentOffset + data.length);
      setHasMore(data.length === limit);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, limit]);

  useEffect(() => {
    if (!projectId) return;
    
    // Reset state when project changes
    setNotes([]);
    setOffset(0);
    setHasMore(true);
    
    fetchNotes(0, false);
  }, [projectId, fetchNotes]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchNotes(offset, true);
    }
  }, [loading, hasMore, offset, fetchNotes]);

  return {
    notes,
    loading,
    error,
    hasMore,
    loadMore,
  };
}
