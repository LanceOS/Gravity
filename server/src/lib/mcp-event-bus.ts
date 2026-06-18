import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Event type literals
// ---------------------------------------------------------------------------

export type McpEventType =
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.deleted'
  | 'comment.added'
  | 'comment.updated'
  | 'comment.deleted'
  | 'labels.added'
  | 'labels.removed'
  | 'labels.set'
  | 'dependency.added'
  | 'dependency.removed'
  | 'subtask.created';

// ---------------------------------------------------------------------------
// Payload type
// ---------------------------------------------------------------------------

export type McpMutationEvent = {
  /** Discriminant — the mutation that occurred. */
  type: McpEventType;
  /** Workspace that owns the mutated resource. Used for broadcast scoping. */
  workspaceId: string;
  /** Project that owns the mutated ticket. */
  projectId: string;
  /** Team that owns the project. */
  teamId: string;
  /** Human-readable ticket identifier, e.g. "GRAV-42". */
  ticketKey: string;
  /** User who performed the mutation. */
  actorUserId: string;
  /** ISO 8601 timestamp of when the event was published. */
  timestamp: string;
  /**
   * Optional mutation-specific extras, e.g. added/removed label names,
   * comment IDs, dependency keys, etc.
   */
  data?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Internal emitter channel names
// ---------------------------------------------------------------------------

/** Channel name used to fan out to workspace-specific subscribers. */
const workspaceChannel = (workspaceId: string) => `ws:${workspaceId}`;
/** Channel name used by subscribers that want every event. */
const GLOBAL_CHANNEL = '__all__';

// ---------------------------------------------------------------------------
// McpEventBus
// ---------------------------------------------------------------------------

/**
 * @description Lightweight in-process event bus for MCP mutation events.
 *
 * Events are scoped per-workspace: `subscribe(workspaceId, handler)` only
 * receives events published for that workspace. `subscribeAll(handler)` receives
 * every event regardless of workspace and is used by the SSE broadcast layer.
 *
 * A singleton instance (`mcpEventBus`) is exported for shared use across the
 * application. The class itself is exported for unit-testing convenience.
 */
export class McpEventBus {
  private readonly emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    // Raise the default listener limit: each SSE client adds one workspace
    // subscriber plus one global subscriber. 512 is a comfortable upper bound
    // before the warning fires.
    this.emitter.setMaxListeners(512);
  }

  /**
   * @description Publishes a mutation event to all subscribers for the event's
   * workspace and to all global subscribers.
   * @param event The typed mutation event payload.
   */
  publish(event: McpMutationEvent): void {
    this.emitter.emit(workspaceChannel(event.workspaceId), event);
    this.emitter.emit(GLOBAL_CHANNEL, event);
  }

  /**
   * @description Subscribes to events for a single workspace.
   * @param workspaceId The workspace to scope subscriptions to.
   * @param handler Callback invoked for each published event in this workspace.
   * @return An unsubscribe function. Call it to stop receiving events.
   */
  subscribe(workspaceId: string, handler: (event: McpMutationEvent) => void): () => void {
    const channel = workspaceChannel(workspaceId);
    this.emitter.on(channel, handler);
    return () => {
      this.emitter.off(channel, handler);
    };
  }

  /**
   * @description Subscribes to all events across every workspace. Used by the
   * SSE broadcast layer which manages its own per-workspace client sets.
   * @param handler Callback invoked for every published event.
   * @return An unsubscribe function.
   */
  subscribeAll(handler: (event: McpMutationEvent) => void): () => void {
    this.emitter.on(GLOBAL_CHANNEL, handler);
    return () => {
      this.emitter.off(GLOBAL_CHANNEL, handler);
    };
  }

  /**
   * @description Returns the number of active subscribers for a workspace.
   * Useful in tests to assert subscription cleanup.
   */
  listenerCount(workspaceId: string): number {
    return this.emitter.listenerCount(workspaceChannel(workspaceId));
  }
}

/** Shared singleton used by all MCP handlers and the SSE broadcast layer. */
export const mcpEventBus = new McpEventBus();
