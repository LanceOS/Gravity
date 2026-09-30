import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from '@library';
import { useActionStatus } from '../../hooks/useActionStatus';

vi.mock('@library', () => ({ toast: { show: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useActionStatus', () => {
  it('blocks duplicate submissions, acknowledges only completion, and unlocks changed input', async () => {
    vi.clearAllMocks();
    const request = deferred<void>();
    const operation = vi.fn(() => request.promise);
    const { result, rerender } = renderHook(({ input }) => useActionStatus(input), { initialProps: { input: 'draft one' } });
    let running!: Promise<boolean>;
    act(() => { running = result.current.run(operation, 'Saved', 'Save failed'); });
    expect(result.current.pending).toBe(true);
    await act(async () => { expect(await result.current.run(operation, 'Saved', 'Save failed')).toBe(false); });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(toast.show).not.toHaveBeenCalled();
    await act(async () => { request.resolve(); await running; });
    expect(result.current.disabled).toBe(true);
    expect(result.current.pending).toBe(false);
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Saved', 'success');
    await act(async () => { await result.current.run(operation, 'Saved', 'Save failed'); });
    expect(operation).toHaveBeenCalledTimes(1);
    rerender({ input: 'draft two' });
    expect(result.current.disabled).toBe(false);
  });

  it('preserves edits made while pending and enables retry after failure', async () => {
    vi.clearAllMocks();
    const request = deferred<void>();
    const { result, rerender } = renderHook(({ input }) => useActionStatus(input), { initialProps: { input: 'one' } });
    let running!: Promise<boolean>;
    act(() => { running = result.current.run(() => request.promise, 'Saved', 'Save failed'); });
    rerender({ input: 'two' });
    await act(async () => { request.reject(new Error('Offline')); expect(await running).toBe(false); });
    expect(result.current.disabled).toBe(false);
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Offline Please try again.', 'error');
    await act(async () => { expect(await result.current.run(async () => true, 'Saved', 'Save failed')).toBe(true); });
    expect(result.current.completed).toBe(true);
  });

  it('does not interpret false or null operation results as success', async () => {
    const { result } = renderHook(() => useActionStatus());
    for (const response of [false, null]) {
      await act(async () => { expect(await result.current.run(async () => response, 'Saved', 'Save failed')).toBe(false); });
      expect(result.current.disabled).toBe(false);
    }
  });
});
