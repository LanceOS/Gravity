import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNote } from '../../modules/notes/hooks/useNote';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

describe('useNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing if noteId is null', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useNote('proj-1', null), { wrapper });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.note).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches a note successfully on mount', async () => {
    const mockNote = { id: 'note-1', title: 'Test', body: 'Body', version: 1 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNote,
    } as Response);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useNote('proj-1', 'note-1'), { wrapper });
    
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.note).toEqual(mockNote);
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/notes/note-1', {
      headers: { 'x-project-id': 'proj-1' },
    });
  });

  it('handles fetch error gracefully', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
    } as Response);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useNote('proj-1', 'note-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load note');
    expect(result.current.note).toBeNull();
  });

  it('saves a note successfully', async () => {
    const mockNote = { id: 'note-1', title: 'Test', body: 'Body', version: 1 };
    const updatedNote = { ...mockNote, title: 'Updated', version: 2 };
    
    // First mock for the initial fetch
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNote,
    } as Response);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useNote('proj-1', 'note-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.note).toEqual(mockNote);
    });

    // Mock for the save request
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedNote,
    } as Response);

    await act(async () => {
      await result.current.saveNote({ title: 'Updated' });
    });

    expect(result.current.saving).toBe(false);
    expect(result.current.saveError).toBeNull();
    expect(result.current.savedAt).toBeInstanceOf(Date);
    expect(result.current.note).toEqual(updatedNote);
    expect(fetchSpy).toHaveBeenLastCalledWith('/api/v1/notes/note-1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-project-id': 'proj-1',
      },
      body: JSON.stringify({ title: 'Updated', version: 1 }),
    });
  });

  it('handles save error and conflict', async () => {
    const mockNote = { id: 'note-1', title: 'Test', body: 'Body', version: 1 };
    
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNote,
    } as Response);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useNote('proj-1', 'note-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.note).toEqual(mockNote);
    });

    // Mock for 409 conflict
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 409,
    } as Response);

    await act(async () => {
      await result.current.saveNote({ title: 'Updated' });
    });

    expect(result.current.saving).toBe(false);
    expect(result.current.saveError).toBe('Version conflict. Please refresh the note.');
    expect(result.current.note).toEqual(mockNote);
  });

  it('uploads media successfully', async () => {
    const mockNote = { id: 'note-1', title: 'Test', body: 'Body', version: 1 };
    
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNote,
    } as Response);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useNote('proj-1', 'note-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.note).toEqual(mockNote);
    });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: '/api/v1/notes/note-1/media/test.png' }),
    } as Response);

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    const url = await result.current.uploadMedia(file);

    expect(url).toBe('/api/v1/notes/note-1/media/test.png');
    expect(fetchSpy).toHaveBeenLastCalledWith('/api/v1/notes/note-1/media?filename=test.png', {
      method: 'POST',
      headers: {
        'x-project-id': 'proj-1',
        'Content-Type': 'image/png',
      },
      body: file,
    });
  });
});
