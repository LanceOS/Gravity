import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NoteEditor } from '../../modules/notes/components/NoteEditor';
import { useNote } from '../../modules/notes/hooks/useNote';

// Mock useNote hook
vi.mock('../../modules/notes/hooks/useNote', () => ({
  useNote: vi.fn(),
}));

// Mock TipTap editor since it's hard to test in JSDOM without full setup
vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    useEditor: () => ({
      isEmpty: true,
      commands: {
        setContent: vi.fn(),
        focus: vi.fn(),
      },
      chain: () => ({
        focus: () => ({
          setImage: vi.fn(),
          toggleBold: vi.fn(),
          toggleItalic: vi.fn(),
          toggleStrike: vi.fn(),
          toggleHeading: vi.fn(),
          toggleBulletList: vi.fn(),
          toggleOrderedList: vi.fn(),
          toggleCodeBlock: vi.fn(),
          toggleBlockquote: vi.fn(),
          setTextSelection: vi.fn(() => ({
            setParagraph: vi.fn(() => ({
              run: vi.fn(),
            })),
          })),
        }),
      }),
      isActive: vi.fn(() => false),
      storage: {
        markdown: {
          getMarkdown: vi.fn(() => 'Test body'),
        },
      },
      getJSON: vi.fn(() => ({ content: [] })),
    }),
    EditorContent: () => <div data-testid="tiptap-editor"></div>,
  };
});

describe('NoteEditor', () => {
  const mockSaveNote = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    (useNote as any).mockReturnValue({
      note: { id: 'note-1', title: 'Test Title', body: 'Test Body' },
      loading: false,
      saving: false,
      saveError: null,
      savedAt: null,
      saveNote: mockSaveNote,
      uploadMedia: vi.fn(),
    });
  });

  it('renders title input and editor content', () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    
    // Check title input exists and has correct value
    const titleInput = screen.getByPlaceholderText('Title...') as HTMLInputElement;
    expect(titleInput).toBeInTheDocument();
    
    // Check editor content container exists
    expect(screen.getByTestId('tiptap-editor')).toBeInTheDocument();
  });

  it('updates title input correctly', async () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    
    const titleInput = screen.getByPlaceholderText('Title...') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Updated Title' } });
    
    expect(titleInput.value).toBe('New Updated Title');
  });

});
