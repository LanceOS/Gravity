import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketUpdateBatchManager } from '../TicketUpdateBatchManager';

type Updates = { title?: string; priority?: string };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const send = vi.fn().mockResolvedValue('saved');
  const onSuccess = vi.fn();
  const onError = vi.fn();
  const manager = new TicketUpdateBatchManager<Updates, string, string>({ debounceMs: 250, send, onSuccess, onError });
  const queue = (updates: Updates, id = 'one', snapshot = 'original') => manager.queue({ id, projectId: 'project', updates, snapshot });
  return { manager, send, onSuccess, onError, queue };
}

describe('TicketUpdateBatchManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('merges edits with the latest field values and first snapshot, resetting the debounce', async () => {
    const { queue, send } = setup();
    queue({ title: 'first', priority: 'low' });
    await vi.advanceTimersByTimeAsync(200);
    queue({ title: 'last' }, 'one', 'optimistic');
    await vi.advanceTimersByTimeAsync(249);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      id: 'one', projectId: 'project', updates: { title: 'last', priority: 'low' }, snapshot: 'original',
    }));
  });

  it('ignores empty updates and makes empty flush/cancel safe', async () => {
    const { queue, manager, send } = setup();
    queue({});
    await manager.flush();
    manager.cancel();
    expect(vi.getTimerCount()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('flushes immediately and awaits persistence without sending twice', async () => {
    const { queue, manager, send } = setup();
    const request = deferred<string>();
    send.mockReturnValue(request.promise);
    queue({ title: 'edit' });
    let settled = false;
    const flushed = manager.flush('one').then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    request.resolve('saved');
    await flushed;
    expect(settled).toBe(true);
  });

  it('serializes a follow-up after an in-flight request and awaits both', async () => {
    const { queue, manager, send, onSuccess } = setup();
    const first = deferred<string>();
    const second = deferred<string>();
    send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    queue({ title: 'first' });
    const flush = manager.flush('one');
    await Promise.resolve();
    queue({ title: 'second' });
    await vi.advanceTimersByTimeAsync(250);
    expect(send).toHaveBeenCalledTimes(1);
    let settled = false;
    const waiting = manager.flush('one').then(() => { settled = true; });
    first.resolve('first');
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(onSuccess.mock.calls[0][0]).toBe('first');
    expect(settled).toBe(false);
    second.resolve('second');
    await Promise.all([flush, waiting]);
    expect(onSuccess.mock.calls.map(call => call[0])).toEqual(['first', 'second']);
  });

  it('keeps the follow-up debounce when the earlier save completes first', async () => {
    const { queue, manager, send } = setup();
    const request = deferred<string>();
    send.mockReturnValueOnce(request.promise);
    queue({ title: 'first' });
    const flushed = manager.flush('one');
    await Promise.resolve();
    queue({ title: 'second' });
    request.resolve('saved');
    await flushed;
    await vi.advanceTimersByTimeAsync(249);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('lets different tickets save independently and flushes all of them', async () => {
    const { queue, manager, send } = setup();
    const slow = deferred<string>();
    send.mockReturnValueOnce(slow.promise);
    queue({ title: 'slow' });
    queue({ title: 'fast' }, 'two');
    const flushed = manager.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    slow.resolve('saved');
    await flushed;
  });

  it('recovers from failure and passes the original snapshot to a queued follow-up', async () => {
    const { queue, manager, send, onError, onSuccess } = setup();
    const failed = deferred<string>();
    send.mockReturnValueOnce(failed.promise).mockRejectedValueOnce(new Error('again'));
    queue({ title: 'first' });
    const flushed = manager.flush('one');
    await Promise.resolve();
    queue({ priority: 'high' }, 'one', 'optimistic');
    await vi.advanceTimersByTimeAsync(250);
    failed.reject(new Error('offline'));
    await flushed;
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0][2]).toMatchObject({ snapshot: 'original', updates: { priority: 'high' } });
    expect(onError.mock.calls[1][1].snapshot).toBe('original');
    queue({ title: 'retry' });
    await manager.flush();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('recovers from a synchronous transport throw', async () => {
    const { queue, manager, send, onError } = setup();
    send.mockImplementationOnce(() => { throw new Error('sync'); });
    queue({ title: 'first' });
    await manager.flush();
    queue({ title: 'retry' });
    await manager.flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('cancels selected or all unsent batches without cancelling running requests', async () => {
    const { queue, manager, send, onSuccess } = setup();
    const request = deferred<string>();
    send.mockReturnValueOnce(request.promise);
    queue({ title: 'running' });
    const flushed = manager.flush('one');
    await Promise.resolve();
    queue({ title: 'cancelled' });
    manager.cancel('one');
    queue({ title: 'other' }, 'two');
    manager.cancel();
    request.resolve('saved');
    await flushed;
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)('suppresses late %s callbacks after disposal and supports fresh initialization', async (outcome) => {
    const { queue, manager, send, onSuccess, onError } = setup();
    const old = deferred<string>();
    const fresh = deferred<string>();
    send.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    queue({ title: 'old' });
    const firstFlush = manager.flush('one');
    await Promise.resolve();
    queue({ title: 'pending' });
    manager.dispose();
    manager.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => queue({ title: 'invalid' })).toThrow('disposed');
    await manager.flush();
    manager.initialize();
    queue({ title: 'fresh' });
    const freshFlush = manager.flush('one');
    await Promise.resolve();
    old[outcome]('old response');
    await firstFlush;
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    fresh.resolve('fresh response');
    await freshFlush;
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith('fresh response', expect.objectContaining({ updates: { title: 'fresh' } }), undefined);
  });

  it('keeps an explicit flush request when more edits arrive during an in-flight save', async () => {
    const { queue, manager, send } = setup();
    const first = deferred<string>();
    send.mockReturnValueOnce(first.promise);
    queue({ title: 'first' });
    const running = manager.flush('one');
    await Promise.resolve();
    queue({ title: 'second' });
    const flushing = manager.flush('one');
    queue({ priority: 'high' });
    first.resolve('saved');
    await Promise.all([running, flushing]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].updates).toEqual({ title: 'second', priority: 'high' });
  });

  it('rebases the follow-up rollback snapshot on a successful server response', async () => {
    const first = deferred<string>();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('offline'));
    const onError = vi.fn();
    const manager = new TicketUpdateBatchManager<Updates, string, string>({
      debounceMs: 250, send, onError, onSuccess: vi.fn(), getSnapshotAfterSuccess: (result) => result,
    });
    manager.queue({ id: 'one', projectId: 'project', updates: { title: 'first' }, snapshot: 'original' });
    const flushed = manager.flush('one');
    await Promise.resolve();
    manager.queue({ id: 'one', projectId: 'project', updates: { title: 'second' }, snapshot: 'optimistic' });
    void manager.flush('one');
    first.resolve('canonical server snapshot');
    await flushed;
    expect(onError.mock.calls[0][1].snapshot).toBe('canonical server snapshot');
  });

  it('returns each batch outcome without waiting for or adopting later outcomes', async () => {
    const { queue, manager, send } = setup();
    const first = deferred<string>();
    const second = deferred<string>();
    send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const firstResult = queue({ title: 'first' });
    const running = manager.flush('one');
    await Promise.resolve();
    const secondResult = queue({ title: 'second' });
    const mergedResult = queue({ priority: 'high' });
    void manager.flush('one');
    first.resolve('saved');
    await expect(firstResult).resolves.toBe(true);
    let secondSettled = false;
    void secondResult.then(() => { secondSettled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(secondSettled).toBe(false);
    second.reject(new Error('offline'));
    await expect(secondResult).resolves.toBe(false);
    await expect(mergedResult).resolves.toBe(false);
    await running;
  });

  it('settles cancelled pending edits as unsuccessful', async () => {
    const { queue, manager } = setup();
    const cancelled = queue({ title: 'cancel' });
    manager.cancel('one');
    await expect(cancelled).resolves.toBe(false);
    const disposed = queue({ title: 'dispose' });
    manager.dispose();
    await expect(disposed).resolves.toBe(false);
  });

  it.each(['success', 'error'] as const)('rebases reentrant edits from the %s callback', async (outcome) => {
    const { queue, manager, send, onSuccess, onError } = setup();
    if (outcome === 'error') send.mockRejectedValueOnce(new Error('offline'));
    let reentrant!: Promise<boolean>;
    const callback = outcome === 'success' ? onSuccess : onError;
    callback.mockImplementationOnce(() => {
      reentrant = queue({ priority: 'high' }, 'one', 'optimistic');
      void manager.flush('one');
    });
    queue({ title: 'first' });
    await manager.flush('one');
    await expect(reentrant).resolves.toBe(true);
    expect(send.mock.calls[1][0].snapshot).toBe('original');
    expect(send.mock.calls[1][0].updates).toEqual({ priority: 'high' });
  });

  it('settles active callers on disposal without waiting for transport', async () => {
    const { queue, manager, send, onSuccess } = setup();
    const response = deferred<string>();
    send.mockReturnValueOnce(response.promise);
    const outcome = queue({ title: 'first' });
    const running = manager.flush('one');
    await Promise.resolve();
    manager.dispose();
    await expect(outcome).resolves.toBe(false);
    response.resolve('late');
    await running;
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('releases the queue even if a consumer callback throws', async () => {
    const { queue, manager, onSuccess, send } = setup();
    onSuccess.mockImplementationOnce(() => { throw new Error('callback'); });
    queue({ title: 'first' });
    await expect(manager.flush()).rejects.toThrow('callback');
    queue({ title: 'next' });
    await manager.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });
});
