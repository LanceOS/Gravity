import { useEffect, useState } from 'react';
import { Button } from '@library';
import './NotesList.css';

export interface NoteMetadata {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface NotesListProps {
  projectId: string;
  onSelectNote: (noteId: string) => void;
}

export function NotesList({ projectId, onSelectNote }: NotesListProps) {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    async function fetchNotes() {
      try {
        const response = await fetch(`/api/v1/notes?limit=${limit}&offset=0`, {
          headers: {
            'x-project-id': projectId,
          },
        });
        
        if (!response.ok) {
          throw new Error('Failed to load notes');
        }
        
        const data = await response.json();
        if (active) {
          setNotes(data);
          setOffset(data.length);
          setHasMore(data.length === limit);
          setLoading(false);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    if (projectId) {
      fetchNotes();
    }

    return () => {
      active = false;
    };
  }, [projectId]);

  const handleLoadMore = async () => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/notes?limit=${limit}&offset=${offset}`, {
        headers: {
          'x-project-id': projectId,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to load notes');
      }
      
      const data = await response.json();
      setNotes((prev) => [...prev, ...data]);
      setOffset((prev) => prev + data.length);
      setHasMore(data.length === limit);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && notes.length === 0) {
    return <div className="notes-list__empty">Loading notes...</div>;
  }

  if (error && notes.length === 0) {
    return <div className="notes-list__empty" style={{ color: 'var(--color-danger)' }}>{error}</div>;
  }

  if (notes.length === 0) {
    return (
      <div className="notes-list">
        <div className="notes-list__empty">
          <div className="notes-list__empty-title">No notes yet</div>
          <p className="notes-list__empty-copy">Create your first note to start documenting your thoughts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="notes-list">
      <div className="notes-list__items">
        {notes.map((note) => (
          <button
            key={note.id}
            className="notes-list__item"
            onClick={() => onSelectNote(note.id)}
            type="button"
          >
            <span className="notes-list__item-title">{note.title || 'Untitled Note'}</span>
            <span className="notes-list__item-date">
              {new Date(note.updatedAt).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>
      
      {hasMore && (
        <div className="notes-list__load-more">
          <Button
            type="button"
            variant="secondary"
            onClick={handleLoadMore}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
