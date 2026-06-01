import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NotesList } from '../../modules/notes/components/NotesList';
import * as useNotesModule from '../../modules/notes/hooks/useNotes';
import type { NoteMetadata } from '../../modules/notes/types';

const mockNotes: NoteMetadata[] = [
  {
    id: 'note-1',
    title: 'First Note',
    projectId: 'proj-1',
    userId: 'user-1',
    version: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'note-2',
    title: 'Second Note',
    projectId: 'proj-1',
    userId: 'user-1',
    version: 1,
    createdAt: '2026-05-02T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
  },
];

describe('NotesList', () => {
  const onSelectNoteMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    vi.spyOn(useNotesModule, 'useNotes').mockReturnValue({
      notes: [],
      loading: true,
      error: null,
      hasMore: true,
      loadMore: vi.fn(),
    });

    render(<NotesList projectId="proj-1" onSelectNote={onSelectNoteMock} />);
    expect(screen.getByText('Loading notes...')).toBeInTheDocument();
  });

  it('shows empty state when no notes exist', () => {
    vi.spyOn(useNotesModule, 'useNotes').mockReturnValue({
      notes: [],
      loading: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
    });

    render(<NotesList projectId="proj-1" onSelectNote={onSelectNoteMock} />);
    expect(screen.getByText('No notes yet')).toBeInTheDocument();
    expect(screen.getByText(/Create your first note to start/i)).toBeInTheDocument();
  });

  it('renders a list of notes and handles selection', async () => {
    const user = userEvent.setup();
    vi.spyOn(useNotesModule, 'useNotes').mockReturnValue({
      notes: mockNotes,
      loading: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
    });

    render(<NotesList projectId="proj-1" onSelectNote={onSelectNoteMock} />);

    expect(screen.getByText('First Note')).toBeInTheDocument();
    expect(screen.getByText('Second Note')).toBeInTheDocument();

    const secondNoteBtn = screen.getByText('Second Note');
    await user.click(secondNoteBtn);

    expect(onSelectNoteMock).toHaveBeenCalledWith('note-2');
  });

  it('shows error state when fetch fails', () => {
    vi.spyOn(useNotesModule, 'useNotes').mockReturnValue({
      notes: [],
      loading: false,
      error: 'Failed to fetch',
      hasMore: false,
      loadMore: vi.fn(),
    });

    render(<NotesList projectId="proj-1" onSelectNote={onSelectNoteMock} />);
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('calls loadMore when Load More button is clicked', async () => {
    const user = userEvent.setup();
    const loadMoreMock = vi.fn();

    vi.spyOn(useNotesModule, 'useNotes').mockReturnValue({
      notes: mockNotes,
      loading: false,
      error: null,
      hasMore: true,
      loadMore: loadMoreMock,
    });

    render(<NotesList projectId="proj-1" onSelectNote={onSelectNoteMock} />);
    
    const loadMoreBtn = screen.getByRole('button', { name: 'Load More' });
    expect(loadMoreBtn).toBeInTheDocument();
    
    await user.click(loadMoreBtn);
    expect(loadMoreMock).toHaveBeenCalled();
  });
});
