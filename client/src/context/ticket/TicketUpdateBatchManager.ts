export interface TicketUpdateBatch<Updates, Snapshot> {
  id: string;
  projectId: string;
  updates: Updates;
  snapshot: Snapshot;
}

interface PendingBatch<Updates, Snapshot> extends TicketUpdateBatch<Updates, Snapshot> {
  timer: ReturnType<typeof setTimeout> | null;
  flushRequested: boolean;
}

export interface TicketUpdateBatchManagerOptions<Updates, Snapshot, Result> {
  debounceMs: number;
  send: (batch: TicketUpdateBatch<Updates, Snapshot>) => Promise<Result>;
  getSnapshotAfterSuccess?: (result: Result, batch: TicketUpdateBatch<Updates, Snapshot>) => Snapshot;
  onSuccess: (
    result: Result,
    batch: TicketUpdateBatch<Updates, Snapshot>,
    followUp: TicketUpdateBatch<Updates, Snapshot> | undefined,
  ) => void;
  onError: (
    error: unknown,
    batch: TicketUpdateBatch<Updates, Snapshot>,
    followUp: TicketUpdateBatch<Updates, Snapshot> | undefined,
  ) => void;
}

/** Owns scheduling only; snapshots and persistence/UI callbacks belong to the caller. */
export class TicketUpdateBatchManager<Updates extends object, Snapshot, Result> {
  private pending = new Map<string, PendingBatch<Updates, Snapshot>>();
  private inFlight = new Map<string, Promise<void>>();
  private generation = 0;
  private disposed = false;
  private readonly options: TicketUpdateBatchManagerOptions<Updates, Snapshot, Result>;

  constructor(options: TicketUpdateBatchManagerOptions<Updates, Snapshot, Result>) {
    this.options = options;
  }

  /** React effect replay may initialize a disposed manager as a fresh lifecycle. */
  initialize() {
    this.disposed = false;
  }

  queue(batch: TicketUpdateBatch<Updates, Snapshot>) {
    if (this.disposed) throw new Error('TicketUpdateBatchManager is disposed');
    if (Object.keys(batch.updates).length === 0) return;
    const previous = this.pending.get(batch.id);
    if (previous?.timer != null) clearTimeout(previous.timer);
    const next: PendingBatch<Updates, Snapshot> = {
      ...batch,
      snapshot: previous ? previous.snapshot : batch.snapshot,
      updates: { ...previous?.updates, ...batch.updates },
      flushRequested: previous?.flushRequested ?? false,
      timer: null,
    };
    this.pending.set(batch.id, next);
    next.timer = setTimeout(() => {
      // Callback failures must not create an unhandled timer rejection. Explicit
      // flush callers still receive callback errors; transport errors use onError.
      void this.flush(batch.id).catch(() => {});
    }, this.options.debounceMs);
  }

  /** Flush this ticket (or all tickets), waiting for requested follow-up batches. */
  async flush(id?: string): Promise<void> {
    if (this.disposed) return;
    if (id === undefined) {
      await Promise.all([...new Set([...this.pending.keys(), ...this.inFlight.keys()])].map(key => this.flush(key)));
      return;
    }
    const batch = this.pending.get(id);
    if (batch) {
      if (batch.timer !== null) clearTimeout(batch.timer);
      batch.timer = null;
      batch.flushRequested = true;
    }
    const running = this.inFlight.get(id);
    if (running) {
      await running;
      return;
    }
    if (!batch) return;
    this.pending.delete(id);
    const generation = this.generation;
    // Defer execution until the promise is registered, including synchronous send errors.
    const work = Promise.resolve().then(async () => {
      if (generation !== this.generation) return;
      let result: Result;
      try {
        result = await this.options.send(batch);
      } catch (error) {
        if (generation !== this.generation) return;
        const followUp = this.pending.get(id);
        if (followUp) followUp.snapshot = batch.snapshot;
        this.options.onError(error, batch, followUp);
        return;
      }
      if (generation !== this.generation) return;
      const followUp = this.pending.get(id);
      if (followUp && this.options.getSnapshotAfterSuccess) {
        followUp.snapshot = this.options.getSnapshotAfterSuccess(result, batch);
      }
      this.options.onSuccess(result, batch, followUp);
    }).finally(async () => {
      if (generation !== this.generation) return;
      this.inFlight.delete(id);
      if (this.pending.get(id)?.flushRequested) await this.flush(id);
    });
    this.inFlight.set(id, work);
    await work;
  }

  /** Discard queued edits; a batch already being flushed is allowed to finish. */
  cancel(id?: string) {
    if (id === undefined) {
      for (const key of this.pending.keys()) this.cancel(key);
      return;
    }
    const batch = this.pending.get(id);
    if (batch?.timer != null) clearTimeout(batch.timer);
    this.pending.delete(id);
  }

  /** Cancel timers and suppress callbacks from requests in the old lifecycle. */
  dispose() {
    this.cancel();
    this.disposed = true;
    this.generation++;
    this.inFlight.clear();
  }
}
