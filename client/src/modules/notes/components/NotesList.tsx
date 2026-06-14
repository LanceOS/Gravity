import { Button } from '@library';
import { useNotes } from '../hooks/useNotes';
import './NotesList.css';

interface NotesListProps {
  projectId: string;
  onSelectNote: (noteId: string) => void;
  sortDirection?: 'desc' | 'asc';
}

export function NotesList({ projectId, onSelectNote, sortDirection = 'desc' }: NotesListProps) {
  const { notes, loading, error, hasMore, loadMore } = useNotes(projectId, sortDirection);

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
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
