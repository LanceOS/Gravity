import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SseEventCoalescer,
  DEFAULT_SSE_COALESCE_WINDOW_MS,
  type SseCoalescedEvent,
} from '../../services/SseEventCoalescer';

describe('SseEventCoalescer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches distinct events into one flush within the configured window', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const coalescer = new SseEventCoalescer(onFlush, { coalesceWindowMs: 100 });

    const events: SseCoalescedEvent[] = [
      { type: 'ticket.updated', ticketKey: 'T-1', projectId: 'project-1' },
      { type: 'comment.added', ticketKey: 'T-1', data: { commentId: 'comment-1' } },
    ];

    for (const event of events) {
      coalescer.enqueue(event);
    }

    expect(onFlush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(events);
  });

  it('deduplicates duplicate events for same type and ticket key within window', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const coalescer = new SseEventCoalescer(onFlush, { coalesceWindowMs: 100 });

    const first = { type: 'labels.added', ticketKey: 'T-1', data: { attempt: 1 } };
    const duplicate = { type: 'labels.added', ticketKey: 'T-1', data: { attempt: 2 } };

    coalescer.enqueue(first);
    coalescer.enqueue(duplicate);

    vi.advanceTimersByTime(100);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([first]);
  });

  it('keeps events for different tickets separate, even with same event type', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const coalescer = new SseEventCoalescer(onFlush, { coalesceWindowMs: 100 });

    const first = { type: 'ticket.updated', ticketKey: 'T-1' };
    const second = { type: 'ticket.updated', ticketKey: 'T-2' };

    coalescer.enqueue(first);
    coalescer.enqueue(second);

    vi.advanceTimersByTime(100);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([first, second]);
  });

  it('supports overriding the coalescing window', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const customWindow = Math.max(1, Math.floor(DEFAULT_SSE_COALESCE_WINDOW_MS / 2));
    const coalescer = new SseEventCoalescer(onFlush, { coalesceWindowMs: customWindow });

    const event: SseCoalescedEvent = { type: 'ticket.deleted', ticketKey: 'T-1' };
    coalescer.enqueue(event);

    vi.advanceTimersByTime(customWindow - 1);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([event]);
  });
});
