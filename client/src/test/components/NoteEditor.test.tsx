import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NoteEditor } from '../../modules/notes/components/NoteEditor';
import { useNote } from '../../modules/notes/hooks/useNote';

vi.mock('../../modules/notes/hooks/useNote', () => ({
  useNote: vi.fn(),
}));

vi.mock('@library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@library')>();
  const MockRichTextEditor = forwardRef<any, any>(function MockRichTextEditor(
    { value, onChange, placeholder, className }: any,
    ref,
  ) {
    const [internalValue, setInternalValue] = useState(value);

    useEffect(() => {
      setInternalValue(value);
    }, [value]);

    useImperativeHandle(ref, () => ({
      focus: () => {},
      insertImage: ({ src, alt, title }: { src: string; alt?: string; title?: string }) => {
        const label = alt || title || 'image';
        const nextValue = `${internalValue}${internalValue ? '\n' : ''}![${label}](${src})`;
        setInternalValue(nextValue);
        onChange(nextValue);
      },
    }), [internalValue, onChange]);

    return (
      <textarea
        data-testid="rich-text-editor"
        aria-label="Rich text editor"
        placeholder={placeholder}
        className={className}
        value={internalValue}
        onChange={(e) => {
          setInternalValue(e.target.value);
          onChange(e.target.value);
        }}
      />
    );
  });

  return {
    ...actual,
    RichTextEditor: MockRichTextEditor,
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

  it('renders the title input and rich text editor when loaded', () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    const titleInput = screen.getByPlaceholderText('Title...') as HTMLInputElement;
    expect(titleInput).toBeInTheDocument();
    expect(titleInput.value).toBe('Test Title');
    expect(screen.getByTestId('rich-text-editor')).toHaveValue('Test body');
  });

  it('normalizes the legacy empty heading body on load', () => {
    (useNote as any).mockReturnValue({
      note: { id: 'note-1', title: 'Test Title', body: '# \n\nReal body' },
      loading: false,
      saving: false,
      saveError: null,
      savedAt: null,
      saveNote: mockSaveNote,
      uploadMedia: mockUploadMedia,
    });

    render(<NoteEditor projectId="proj-1" noteId="note-1" />);

    expect(screen.getByTestId('rich-text-editor')).toHaveValue('Real body');
  });

  it('updates title input and triggers debounced save', () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);

    const titleInput = screen.getByPlaceholderText('Title...') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'New Updated Title' } });

    expect(titleInput.value).toBe('New Updated Title');
    expect(mockSaveNote).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockSaveNote).toHaveBeenCalledWith({
      title: 'New Updated Title',
      body: 'Test body',
    });
  });

  it('triggers debounced save when editor content updates', () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);

    const richTextEditor = screen.getByTestId('rich-text-editor');
    fireEvent.change(richTextEditor, { target: { value: 'New body content' } });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockSaveNote).toHaveBeenCalledWith({
      title: 'Test Title',
      body: 'New body content',
    });
  });

  it('displays saving state', () => {
    (useNote as any).mockReturnValue({
      note: { id: 'note-1', title: 'Test Title', body: 'Test body' },
      saving: true,
      saveError: null,
      savedAt: null,
      saveNote: mockSaveNote,
      uploadMedia: mockUploadMedia,
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
      saveNote: mockSaveNote,
      uploadMedia: mockUploadMedia,
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
      saveNote: mockSaveNote,
      uploadMedia: mockUploadMedia,
    });

    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    expect(screen.getByText(`Saved ${time.toLocaleTimeString()}`)).toBeInTheDocument();
  });

  it('handles drag and drop file uploads', async () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);

    const dropZone = screen.getByTestId('rich-text-editor').parentElement?.parentElement!;

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
    expect(screen.getByTestId('rich-text-editor')).toHaveValue('Test body\n![test.png](/image.png)');
  });

  it('handles file input uploads via toolbar', async () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy content'], 'test.png', { type: 'image/png' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(mockUploadMedia).toHaveBeenCalledWith(file);
    expect(screen.getByTestId('rich-text-editor')).toHaveValue('Test body\n![test.png](/image.png)');
  });
});
