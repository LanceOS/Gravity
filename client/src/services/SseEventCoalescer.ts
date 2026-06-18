export type SseCoalescedEvent = {
  type: string;
  ticketKey?: string;
  projectId?: string;
  data?: Record<string, unknown>;
};

export type SseEventBatchHandler = (events: SseCoalescedEvent[]) => void;

export interface SseEventCoalescerOptions {
  coalesceWindowMs?: number;
}

export const DEFAULT_SSE_COALESCE_WINDOW_MS = 100;

export class SseEventCoalescer {
  private readonly onFlush: SseEventBatchHandler;
  private readonly coalesceWindowMs: number;
  private readonly pendingEvents = new Map<string, SseCoalescedEvent>();
  private timerId: ReturnType<typeof setTimeout> | null = null;

  constructor(onFlush: SseEventBatchHandler, options: SseEventCoalescerOptions = {}) {
    this.onFlush = onFlush;
    this.coalesceWindowMs = options.coalesceWindowMs ?? DEFAULT_SSE_COALESCE_WINDOW_MS;
  }

  enqueue(event: SseCoalescedEvent | null | undefined): void {
    if (!event || typeof event.type !== 'string' || !event.type) {
      return;
    }

    const key = this.buildEventKey(event);
    if (this.pendingEvents.has(key)) {
      return;
    }

    this.pendingEvents.set(key, event);

    if (!this.timerId) {
      this.timerId = setTimeout(() => {
        this.flush();
      }, this.coalesceWindowMs);
    }
  }

  flush(): void {
    if (!this.timerId && this.pendingEvents.size === 0) {
      return;
    }

    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.pendingEvents.size === 0) {
      return;
    }

    const events = Array.from(this.pendingEvents.values());
    this.pendingEvents.clear();

    this.onFlush(events);
  }

  destroy(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.pendingEvents.clear();
  }

  private buildEventKey(event: SseCoalescedEvent): string {
    const key = event.ticketKey ?? '';
    const projectId = event.projectId ?? '';
    return `${event.type}::${projectId}::${key}`;
  }
}
