import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NoteEditor } from '../../modules/notes/components/NoteEditor';
import { useNote } from '../../modules/notes/hooks/useNote';

// Mock useNote hook
vi.mock('../../modules/notes/hooks/useNote', () => ({
  useNote: vi.fn(),
}));

const mockTipTapCommands = {
  setContent: vi.fn(),
  focus: vi.fn(),
};

const mockTipTapChain = {
  setImage: vi.fn().mockReturnThis(),
  toggleBold: vi.fn().mockReturnThis(),
  toggleItalic: vi.fn().mockReturnThis(),
  toggleStrike: vi.fn().mockReturnThis(),
  toggleHeading: vi.fn().mockReturnThis(),
  toggleBulletList: vi.fn().mockReturnThis(),
  toggleOrderedList: vi.fn().mockReturnThis(),
  toggleCodeBlock: vi.fn().mockReturnThis(),
  toggleBlockquote: vi.fn().mockReturnThis(),
  setTextSelection: vi.fn().mockReturnThis(),
  setParagraph: vi.fn().mockReturnThis(),
  run: vi.fn(),
};

const mockEditor = {
  isEmpty: false,
  commands: mockTipTapCommands,
  chain: vi.fn(() => ({
    focus: vi.fn(() => mockTipTapChain),
    ...mockTipTapChain,
  })),
  isActive: vi.fn(() => false),
  storage: {
    markdown: {
      getMarkdown: vi.fn(() => 'Test body'),
    },
  },
  getJSON: vi.fn(() => ({ content: [] })),
};

vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    useEditor: (options: any) => {
      // Need to capture options so we can trigger onUpdate if needed in tests
      (globalThis as any).__tiptapOnUpdate = options?.onUpdate;
      return mockEditor;
    },
    EditorContent: () => <div data-testid="tiptap-editor"></div>,
  };
});

describe('NoteEditor', () => {
  const mockSaveNote = vi.fn();
  const mockUploadMedia = vi.fn().mockResolvedValue('/image.png');
  
  beforeEach(() => {
    vi.clearAllMocks();
    (useNote as any).mockReturnValue({
      note: { id: 'note-1', title: 'Test Title', body: 'Test body', version: 1 },
      loading: false,
      saving: false,
      saveError: null,
      savedAt: null,
      saveNote: mockSaveNote,
      uploadMedia: mockUploadMedia,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state initially if loading', () => {
    (useNote as any).mockReturnValue({ loading: true, note: null });
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    expect(screen.getByText('Loading note...')).toBeInTheDocument();
  });

  it('renders title input and editor content when loaded', () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    const titleInput = screen.getByPlaceholderText('Title...') as HTMLInputElement;
    expect(titleInput).toBeInTheDocument();
    expect(titleInput.value).toBe('Test Title');
    expect(screen.getByTestId('tiptap-editor')).toBeInTheDocument();
  });

  it('sets initial content and strips legacy empty H1', () => {
    (useNote as any).mockReturnValue({
      note: { id: 'note-1', title: 'Test Title', body: '# \n\nReal body' },
      loading: false,
      saving: false,
      saveError: null,
      savedAt: null,
      saveNote: mockSaveNote,
    });
    
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    
    // Expect setContent to be called with '# \n\n' stripped
    expect(mockTipTapCommands.setContent).toHaveBeenCalledWith('Real body');
  });

  it('updates title input and triggers debounced save', () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    
    const titleInput = screen.getByPlaceholderText('Title...') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Updated Title' } });
    
    expect(titleInput.value).toBe('New Updated Title');
    expect(mockSaveNote).not.toHaveBeenCalled();

    // Fast-forward 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockSaveNote).toHaveBeenCalledWith({
      title: 'New Updated Title',
      body: 'Test body',
    });
  });

  it('triggers debounced save when editor content updates', () => {
    mockEditor.storage.markdown.getMarkdown.mockReturnValueOnce('New body');
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    
    // Simulate tipTap update
    act(() => {
      const onUpdate = (globalThis as any).__tiptapOnUpdate;
      if (typeof onUpdate === 'function') {
        onUpdate();
      }
    });

    // Fast forward
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockSaveNote).toHaveBeenCalledWith({
      title: 'Test Title',
      body: 'New body',
    });
  });

  it('displays saving state', () => {
    (useNote as any).mockReturnValue({
      note: { id: 'note-1', title: 'Test Title', body: 'Test body' },
      saving: true,
      saveError: null,
      savedAt: null,
    });
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('displays save error state', () => {
    (useNote as any).mockReturnValue({
      note: { id: 'note-1', title: 'Test Title', body: 'Test body' },
      saving: false,
      saveError: 'Network Error',
      savedAt: null,
    });
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    expect(screen.getByText('Failed to save: Network Error')).toBeInTheDocument();
  });

  it('displays saved at time', () => {
    const time = new Date('2026-01-01T12:00:00Z');
    (useNote as any).mockReturnValue({
      note: { id: 'note-1', title: 'Test Title', body: 'Test body' },
      saving: false,
      saveError: null,
      savedAt: time,
    });
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    expect(screen.getByText(`Saved ${time.toLocaleTimeString()}`)).toBeInTheDocument();
  });

  it('handles toolbar button clicks', () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    
    const boldBtn = screen.getByTitle('Bold');
    fireEvent.click(boldBtn);
    expect(mockTipTapChain.toggleBold).toHaveBeenCalled();

    const italicBtn = screen.getByTitle('Italic');
    fireEvent.click(italicBtn);
    expect(mockTipTapChain.toggleItalic).toHaveBeenCalled();

    const h1Btn = screen.getByTitle('Heading 1');
    fireEvent.click(h1Btn);
    expect(mockTipTapChain.toggleHeading).toHaveBeenCalledWith({ level: 1 });
  });

  it('handles drag and drop file uploads', async () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    
    const dropZone = screen.getByTestId('tiptap-editor').parentElement?.parentElement!;
    
    fireEvent.dragOver(dropZone);
    expect(screen.getByText('Drop image to attach')).toBeInTheDocument();
    
    fireEvent.dragLeave(dropZone);

    const file = new File(['dummy content'], 'test.png', { type: 'image/png' });
    
    await act(async () => {
      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file],
        },
      });
    });

    expect(mockUploadMedia).toHaveBeenCalledWith(file);
    // Since mockUploadMedia is mocked to return /image.png, it should set image in tiptap
    expect(mockTipTapChain.setImage).toHaveBeenCalledWith({ src: '/image.png' });
  });

  it('handles file input uploads via toolbar', async () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    
    // We cannot easily click the invisible file input directly via the button in JSDOM,
    // so we trigger change event directly on the input.
    // In our component, we have a hidden file input before the "Attach Image" button.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy content'], 'test.png', { type: 'image/png' });
    
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(mockUploadMedia).toHaveBeenCalledWith(file);
    expect(mockTipTapChain.setImage).toHaveBeenCalledWith({ src: '/image.png' });
  });
});
