import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NoteEditor } from '../../modules/notes/components/NoteEditor';
import { writeDraft } from '../../modules/notes/components/noteDrafts';
import { useNote } from '../../modules/notes/hooks/useNote';

vi.mock('../../modules/notes/hooks/useNote', () => ({
  useNote: vi.fn(),
}));

vi.mock('@library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@library')>();
  const MockRichTextEditor = forwardRef<any, any>(function MockRichTextEditor(
    { value, onChange, placeholder, className, toolbarMode }: any,
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
        data-toolbar-mode={toolbarMode || 'full'}
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
    writeDraft('gravity:note-draft:[null,"proj-1","note-1"]', null);
    writeDraft('gravity:note-draft:[null,"proj-1","note-2"]', null);
    mockSaveNote.mockResolvedValue(undefined);
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
    expect(screen.getByTestId('rich-text-editor')).toHaveAttribute('data-toolbar-mode', 'bubble');
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
    }, 1, false);
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
    }, 1, false);
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
  it('opens the image picker from a visible control with explicit accepted extensions', () => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    const input = screen.getByLabelText('Attach image file');
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Attach image' }));
    expect(click).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute('accept', '.png,.jpg,.jpeg,.webp,.gif');
  });

  it.each([
    ['vector.svg', 'image/svg+xml', 'Choose a PNG'],
    ['video.mp4', 'video/mp4', 'Choose a PNG'],
    ['disguised.png', 'image/svg+xml', 'Choose a PNG'],
    ['my photo.png', 'image/png', 'Rename the file'],
  ])('rejects unsupported dropped file %s with a visible error', async (name, type, message) => {
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    await act(async () => {
      fireEvent.drop(screen.getByTestId('rich-text-editor'), { dataTransfer: { files: [new File(['x'], name, { type })] } });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(mockUploadMedia).not.toHaveBeenCalled();
  });

  it('shows upload failures and permits retrying the same file', async () => {
    mockUploadMedia.mockRejectedValueOnce(new Error('Storage unavailable'));
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    const input = screen.getByLabelText('Attach image file');
    const file = new File(['x'], 'test.png', { type: 'image/png' });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    expect(screen.getByRole('alert')).toHaveTextContent('Storage unavailable');
    expect(input).toHaveValue('');
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockUploadMedia).toHaveBeenCalledTimes(2);
  });

  it('blocks concurrent attachment uploads and reload while an upload is pending', async () => {
    let finish!: (url: string) => void;
    mockUploadMedia.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
    render(<NoteEditor projectId="proj-1" noteId="note-1" />);
    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Dirty title' } });
    const input = screen.getByLabelText('Attach image file');
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    expect(screen.getByRole('button', { name: 'Reload server version' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Uploading image…' })).toBeDisabled();
    await act(async () => { fireEvent.drop(screen.getByTestId('rich-text-editor'), { dataTransfer: { files: [file] } }); });
    expect(mockUploadMedia).toHaveBeenCalledTimes(1);
    await act(async () => { finish('/image.png'); });
    expect(screen.getByRole('button', { name: 'Reload server version' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Attach image' })).toBeEnabled();
  });

});
