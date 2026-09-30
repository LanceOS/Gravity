import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, useQueries, useQuery } from '../../utils/react-query-mock';

function createHarness() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('query hook dependencies', () => {
  it('refetches a cached zero-stale-time query on mount without looping on completion', async () => {
    const { client, wrapper } = createHarness();
    client.setQueryData(['lint-regression'], 'cached');
    const queryFn = vi.fn().mockResolvedValue('fresh');
    const { result, rerender } = renderHook(() => useQuery({
      queryKey: ['lint-regression'], queryFn, staleTime: 0,
    }), { wrapper });
    await waitFor(() => expect(result.current.data).toBe('fresh'));
    rerender();
    await act(async () => { await Promise.resolve(); });
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('treats equivalent key objects as the same subscription and fetches a changed key', async () => {
    const { wrapper } = createHarness();
    const queryFn = vi.fn().mockResolvedValue('value');
    const { result, rerender } = renderHook(({ id }) => useQuery({
      queryKey: ['lint-regression', { id }], queryFn, staleTime: Infinity,
    }), { wrapper, initialProps: { id: 'one' } });
    await waitFor(() => expect(result.current.data).toBe('value'));
    rerender({ id: 'one' });
    expect(queryFn).toHaveBeenCalledTimes(1);
    rerender({ id: 'two' });
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
  });

  it('uses the latest query callback for a retained useQueries refetch handle', async () => {
    const { wrapper } = createHarness();
    const first = vi.fn().mockResolvedValue('first');
    const second = vi.fn().mockResolvedValue('second');
    const { result, rerender } = renderHook(({ queryFn }) => useQueries({
      queries: [{ queryKey: ['lint-regression'], queryFn, staleTime: 0 }],
    }), { wrapper, initialProps: { queryFn: first } });
    await waitFor(() => expect(result.current[0].data).toBe('first'));
    const refetch = result.current[0].refetch;
    rerender({ queryFn: second });
    await act(async () => { refetch(); });
    await waitFor(() => expect(result.current[0].data).toBe('second'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
