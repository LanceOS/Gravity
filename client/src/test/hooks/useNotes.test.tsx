import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNotes } from '../../modules/notes/hooks/useNotes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

describe('useNotes', () => {
  const baseNoteMetadata = {
    projectId: 'proj-1',
    userId: 'user-1',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches notes on mount and sets state appropriately', async () => {
    const mockNotes = [
      { id: '1', title: 'Note 1', version: 1, ...baseNoteMetadata },
      { id: '2', title: 'Note 2', version: 1, ...baseNoteMetadata },
    ];
    
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNotes,
    } as Response);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useNotes('proj-1'), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.notes).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notes).toEqual(mockNotes);
    expect(result.current.error).toBeNull();
    // Assuming limit is 20 and we returned 2 items, hasMore should be false
    expect(result.current.hasMore).toBe(false);

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/notes?limit=20&offset=0&sort=desc', expect.objectContaining({
      method: 'GET',
      headers: {
        'x-project-id': 'proj-1',
        'Content-Type': 'application/json',
      },
    }));
  });

  it('handles fetch errors correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
    } as Response);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useNotes('proj-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load notes');
    expect(result.current.notes).toEqual([]);
  });

  it('handles loadMore when there are more notes', async () => {
    const firstPage = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      title: `Note ${i}`,
      version: 1,
      ...baseNoteMetadata,
    }));
    const secondPage = [{ id: '20', title: 'Note 20', version: 1, ...baseNoteMetadata }];

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => firstPage,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => secondPage,
      } as Response);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useNotes('proj-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notes).toHaveLength(20);
    expect(result.current.hasMore).toBe(true);

    // Trigger loadMore
    result.current.loadMore();

    await waitFor(() => {
      expect(result.current.notes).toHaveLength(21);
    });

    expect(result.current.hasMore).toBe(false);
    expect(fetchSpy).toHaveBeenLastCalledWith('/api/v1/notes?limit=20&offset=20&sort=desc', expect.objectContaining({
      method: 'GET',
      headers: {
        'x-project-id': 'proj-1',
        'Content-Type': 'application/json',
      },
    }));
  });

  it('does not loadMore if already loading or no more items', async () => {
    const firstPage = [{ id: '1', title: 'Note 1', version: 1, ...baseNoteMetadata }];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => firstPage,
    } as Response);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useNotes('proj-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);

    // Trigger loadMore
    result.current.loadMore();

    // fetch shouldn't be called again
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
  
  it('resets state when projectId changes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(({ projectId }) => useNotes(projectId), {
      initialProps: { projectId: 'proj-1' },
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender({ projectId: 'proj-2' });
    
    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringContaining('/api/v1/notes'), expect.objectContaining({
      method: 'GET',
      headers: {
        'x-project-id': 'proj-2',
        'Content-Type': 'application/json',
      },
    }));
  });
});
