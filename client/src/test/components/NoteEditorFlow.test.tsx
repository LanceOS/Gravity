/**
 * NoteEditorFlow.test.tsx
 *
 * Verifies the Create New Note → NoteEditor flow in WorkspacePage:
 *
 *  1. NotesList is shown when activeNoteId is empty.
 *  2. NoteEditor is shown (and NotesList is hidden) when activeNoteId is set.
 *  3. "Create New Note" is shown when there is no active note.
 *  4. "Back to Notes" is shown when a note is active.
 *  5. Clicking "Back to Notes" calls onSelectNote('').
 *  6. Clicking "Create New Note" POSTs to /api/v1/notes and calls onSelectNote with the new ID.
 *  7. A failed POST does NOT call onSelectNote.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Stubs for heavy modules ─────────────────────────────────────────────────
vi.mock('@library', () => ({
  Button: ({ children, onClick, ...rest }: any) => (
    <button type="button" onClick={onClick} {...rest}>{children}</button>
  ),
}));
vi.mock('../../modules/tickets/components/TicketBoard', () => ({ TicketBoard: () => null }));
vi.mock('../../modules/tickets/components/TicketList', () => ({ TicketList: () => null }));
vi.mock('../../modules/tickets/components/TicketDetail', () => ({ TicketDetail: () => null }));
vi.mock('../../modules/tickets/components/TicketFilterBar', () => ({ TicketFilterBar: () => null }));
vi.mock('../../modules/workspaces/components/WorkspaceMcpModal', () => ({ default: () => null }));
vi.mock('../../modules/workspaces', () => ({
  WorkspaceHeader: Object.assign(
    ({ children }: any) => <div>{children}</div>,
    {
      Top: ({ children }: any) => <div>{children}</div>,
      Bottom: ({ children }: any) => <div>{children}</div>,
      Title: ({ children }: any) => <h1>{children}</h1>,
      ViewToggle: () => null,
    },
  ),
}));

// Lightweight stubs that are identifiable via data-testid
vi.mock('../../modules/notes/components/NotesList', () => ({
  NotesList: ({ projectId }: { projectId: string }) => (
    <div data-testid="notes-list" data-project-id={projectId} />
  ),
}));
vi.mock('../../modules/notes/components/NoteEditor', () => ({
  NoteEditor: ({ noteId }: { noteId: string }) => (
    <div data-testid="note-editor" data-note-id={noteId} />
  ),
}));
vi.mock('../../modules/notes', async () => {
  const { NotesList } = await import('../../modules/notes/components/NotesList');
  const { NoteEditor } = await import('../../modules/notes/components/NoteEditor');
  return { NotesList, NoteEditor };
});

import { WorkspacePage } from '../../pages/WorkspacePage/WorkspacePage';

// ─── Fixtures ────────────────────────────────────────────────────────────────
const baseProject = {
  id: 'proj-1',
  workspaceId: 'ws-1',
  name: 'Test Project',
  key: 'TEST',
  description: '',
  status: 'active' as const,
  defaultProjectId: null,
};

function buildProps(overrides: Record<string, any> = {}) {
  return {
    activeContext: 'notes' as const,
    activeNoteId: '',
    activeTicket: null,
    activeView: 'board' as const,
    comments: [],
    currentUser: null,
    cycles: [],
    domains: [],
    filters: {
      projectId: 'proj-1',
      search: '',
      priority: '',
      status: '',
      domainId: '',
      cycleId: '',
      assigneeId: '',
    },
    listSort: 'created' as const,
    projects: [baseProject],
    tickets: [],
    users: [],
    onAddComment: vi.fn(),
    onUpdateComment: vi.fn(),
    onDeleteComment: vi.fn(),
    onDeleteTicket: vi.fn(),
    onOpenCreateSubtask: vi.fn(),
    onOpenCreateTicket: vi.fn(),
    onOpenProjectManager: vi.fn(),
    onSelectTicket: vi.fn(),
    onSelectNote: vi.fn(),
    onSetFilters: vi.fn(),
    onSetListSort: vi.fn(),
    onSetView: vi.fn(),
    onUpdateTicket: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('WorkspacePage – notes context', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders NotesList when activeNoteId is empty', () => {
    render(<WorkspacePage {...buildProps()} />);
    expect(screen.getByTestId('notes-list')).toBeInTheDocument();
    expect(screen.queryByTestId('note-editor')).not.toBeInTheDocument();
  });

  it('renders NoteEditor instead of NotesList when activeNoteId is set', () => {
    render(<WorkspacePage {...buildProps({ activeNoteId: 'note-abc' })} />);
    expect(screen.getByTestId('note-editor')).toBeInTheDocument();
    expect(screen.getByTestId('note-editor').dataset.noteId).toBe('note-abc');
    expect(screen.queryByTestId('notes-list')).not.toBeInTheDocument();
  });

  it('shows "Create New Note" and hides "Back to Notes" when no note is active', () => {
    render(<WorkspacePage {...buildProps()} />);
    expect(screen.getByRole('button', { name: /create new note/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to notes/i })).not.toBeInTheDocument();
  });

  it('shows "Back to Notes" and hides "Create New Note" when a note is active', () => {
    render(<WorkspacePage {...buildProps({ activeNoteId: 'note-abc' })} />);
    expect(screen.getByRole('button', { name: /back to notes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create new note/i })).not.toBeInTheDocument();
  });

  it('calls onSelectNote("") when "Back to Notes" is clicked', async () => {
    const user = userEvent.setup();
    const onSelectNote = vi.fn();
    render(<WorkspacePage {...buildProps({ activeNoteId: 'note-abc', onSelectNote })} />);
    await user.click(screen.getByRole('button', { name: /back to notes/i }));
    expect(onSelectNote).toHaveBeenCalledWith('');
  });

  it('POSTs to /api/v1/notes and calls onSelectNote with the new note ID on success', async () => {
    const user = userEvent.setup();
    const onSelectNote = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'note-new-123', title: 'Untitled Note' }),
    } as Response);

    render(<WorkspacePage {...buildProps({ onSelectNote })} />);
    await user.click(screen.getByRole('button', { name: /create new note/i }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/v1/notes',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'x-project-id': 'proj-1' }),
        }),
      ),
    );
    await waitFor(() => expect(onSelectNote).toHaveBeenCalledWith('note-new-123'));

    fetchSpy.mockRestore();
  });

  it('does NOT call onSelectNote when the POST returns a non-ok response', async () => {
    const user = userEvent.setup();
    const onSelectNote = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    } as Response);

    render(<WorkspacePage {...buildProps({ onSelectNote })} />);
    await user.click(screen.getByRole('button', { name: /create new note/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(onSelectNote).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
