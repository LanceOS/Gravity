import { Blob as NodeBlob } from 'node:buffer';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteEditor } from '../../modules/notes/components/NoteEditor';
import { notesService } from '../../modules/notes/services/notesService';
import { readDraft, writeDraft } from '../../modules/notes/components/noteDrafts';
import { ApiError } from '../../utils/apiClient';
import type { Note } from '../../modules/notes/types';

vi.mock('@library', () => ({
  toast: { show: vi.fn() },
  Button: ({ children, size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string }) => <button data-size={size} {...props}>{children}</button>,
  createEmptyRichTextValue: () => '',

  isRichTextDocumentJSON: () => false,
  RichTextEditor: ({ value, onChange, readOnly }: { value: string; onChange: (value: string) => void; readOnly: boolean }) => (
    <textarea aria-label="Note body" value={value} readOnly={readOnly} onChange={event => onChange(event.target.value)} />
  ),
}));

const note = (id: string, version = 1): Note => ({
  id, projectId: 'project', userId: 'owner', title: id, body: `body ${id}`, version, createdAt: '', updatedAt: '',
});
const draftKey = (id: string) => `gravity:note-draft:["owner","project","${id}"]`;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
};
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(1500); });
const typeBody = (value: string) => fireEvent.change(screen.getByLabelText('Note body'), { target: { value } });

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = (id: string) => <QueryClientProvider client={client}><NoteEditor projectId="project" noteId={id} /></QueryClientProvider>;
  const view = render(element('a'));
  await act(async () => {});
  return { ...view, navigate: (id: string) => act(async () => view.rerender(element(id))) };
}

describe('note save and recovery integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeDraft(draftKey('a'), null);
    writeDraft(draftKey('b'), null);
    vi.spyOn(notesService, 'getNote').mockImplementation(async (_project, id) => note(id));
    vi.spyOn(notesService, 'updateNote').mockImplementation(async (_project, id, updates) => ({ ...note(id), ...updates, version: updates.version + 1 }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('flushes on switching before debounce, cancels the old timer, and leaves the new note unchanged', async () => {
    const view = await setup();
    typeBody('edited a');
    await view.navigate('b');
    expect(notesService.updateNote).toHaveBeenCalledExactlyOnceWith('project', 'a', { title: 'a', body: 'edited a', version: 1 });
    expect(screen.getByLabelText('Note body')).toHaveValue('body b');
    await tick();
    expect(notesService.updateNote).toHaveBeenCalledTimes(1);
  });

  it('serializes typing during an in-flight save using each acknowledged version', async () => {
    const first = deferred<Note>();
    const second = deferred<Note>();
    vi.mocked(notesService.updateNote).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await setup();
    typeBody('first');
    await tick();
    typeBody('second');
    await tick();
    expect(notesService.updateNote).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve({ ...note('a', 2), body: 'first' }));
    expect(notesService.updateNote).toHaveBeenLastCalledWith('project', 'a', { title: 'a', body: 'second', version: 2 });
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByLabelText('Note body')).toHaveValue('second');
    expect(readDraft(draftKey('a'))).toMatchObject({ body: 'second', version: 2 });
    await act(async () => second.resolve({ ...note('a', 3), body: 'second' }));
    expect(readDraft(draftKey('a'))).toBeNull();
    expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
  });

  it('does not clear an edit that returns to an earlier snapshot while a different write is queued', async () => {
    const first = deferred<Note>();
    const second = deferred<Note>();
    vi.mocked(notesService.updateNote).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await setup();
    typeBody('first');
    await tick();
    typeBody('second');
    await tick();
    typeBody('first');
    await act(async () => first.resolve({ ...note('a', 2), body: 'first' }));
    expect(readDraft(draftKey('a'))).toMatchObject({ body: 'first', version: 2 });
    await act(async () => second.resolve({ ...note('a', 3), body: 'second' }));
    expect(readDraft(draftKey('a'))).toMatchObject({ body: 'first', version: 3 });
    await tick();
    expect(notesService.updateNote).toHaveBeenLastCalledWith('project', 'a', { title: 'a', body: 'first', version: 3 });
    expect(readDraft(draftKey('a'))).toBeNull();
  });

  it('tracks a save across unmount and reopening without duplicating the completed write', async () => {
    const pending = deferred<Note>();
    vi.mocked(notesService.updateNote).mockReturnValueOnce(pending.promise);
    const view = await setup();
    typeBody('retained');
    await view.navigate('b');
    await view.navigate('a');
    expect(screen.getByLabelText('Note body')).toHaveValue('retained');
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    await act(async () => pending.resolve({ ...note('a', 2), body: 'retained' }));
    expect(screen.queryByRole('button', { name: 'Download draft' })).not.toBeInTheDocument();
    await view.navigate('b');
    expect(notesService.updateNote).toHaveBeenCalledTimes(1);
  });

  it('keeps newer edits made after reopening while the older save completes', async () => {
    const pending = deferred<Note>();
    vi.mocked(notesService.updateNote).mockReturnValueOnce(pending.promise);
    const view = await setup();
    typeBody('first');
    await view.navigate('b');
    await view.navigate('a');
    typeBody('newer');
    await act(async () => pending.resolve({ ...note('a', 2), body: 'first' }));
    expect(readDraft(draftKey('a'))).toMatchObject({ body: 'newer', version: 2 });
    await tick();
    expect(notesService.updateNote).toHaveBeenLastCalledWith('project', 'a', { title: 'a', body: 'newer', version: 2 });
  });

  it('preserves a 409 draft and exports its exact content before confirmed reload', async () => {
    vi.mocked(notesService.updateNote).mockRejectedValueOnce(new ApiError(409, 'Conflict'));
    const view = await setup();
    typeBody('local unsaved');
    await tick();
    expect(screen.getByText(/Version conflict/)).toBeInTheDocument();
    expect(readDraft(draftKey('a'))).toMatchObject({ body: 'local unsaved', version: 1 });
    await view.navigate('b');
    await view.navigate('a');
    expect(screen.getByLabelText('Note body')).toHaveValue('local unsaved');
    vi.stubGlobal('Blob', NodeBlob);
    const createURL = vi.fn().mockReturnValue('blob:draft');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createURL, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Download draft' }));
    const blob = createURL.mock.calls[0][0] as NodeBlob;
    const content = await blob.text();
    expect(JSON.parse(content)).toEqual({ title: 'a', body: 'local unsaved' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Reload server version' }));
    expect(screen.getByLabelText('Note body')).toHaveValue('local unsaved');
    confirm.mockReturnValue(true);
    vi.mocked(notesService.getNote).mockResolvedValueOnce({ ...note('a', 4), body: 'remote' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reload server version' })));
    expect(screen.getByLabelText('Note body')).toHaveValue('remote');
    expect(readDraft(draftKey('a'))).toBeNull();
    typeBody('merged manually');
    await tick();
    expect(notesService.updateNote).toHaveBeenLastCalledWith('project', 'a', { title: 'a', body: 'merged manually', version: 4 });
  });

  it('retains a failed save and failed reload, then retries successfully', async () => {
    vi.mocked(notesService.updateNote).mockRejectedValueOnce(new Error('Offline'));
    await setup();
    typeBody('keep me');
    await tick();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(notesService.getNote).mockRejectedValueOnce(new Error('Still offline'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reload server version' })));
    expect(screen.getByText('Failed to reload: Still offline')).toBeInTheDocument();
    expect(screen.getByLabelText('Note body')).toHaveValue('keep me');
    expect(readDraft(draftKey('a'))).toMatchObject({ body: 'keep me', version: 1 });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry save' })));
    expect(readDraft(draftKey('a'))).toBeNull();
    expect(screen.queryByText(/Failed to save/)).not.toBeInTheDocument();
  });

  it('warns on closing, flushes unmount, and retains the close warning after an offline flush', async () => {
    vi.mocked(notesService.updateNote).mockRejectedValueOnce(new Error('Offline'));
    const view = await setup();
    typeBody('closing draft');
    const beforeClose = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeClose);
    expect(beforeClose.defaultPrevented).toBe(true);
    await act(async () => view.unmount());
    await tick();
    expect(notesService.updateNote).toHaveBeenCalledExactlyOnceWith('project', 'a', { title: 'a', body: 'closing draft', version: 1 });
    const afterClose = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterClose);
    expect(afterClose.defaultPrevented).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(draftKey('a'))!)).toMatchObject({ body: 'closing draft', version: 1 });
  });

  it('restores a persisted draft without rebasing it onto a newer fetched version', async () => {
    sessionStorage.setItem(draftKey('a'), JSON.stringify({ title: 'draft title', body: 'draft body', version: 1 }));
    vi.mocked(notesService.getNote).mockResolvedValueOnce(note('a', 5));
    await setup();
    expect(screen.getByLabelText('Note body')).toHaveValue('draft body');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry save' })));
    expect(notesService.updateNote).toHaveBeenCalledExactlyOnceWith('project', 'a', { title: 'draft title', body: 'draft body', version: 1 });
  });
});
