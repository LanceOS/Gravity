import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { env } from '../env.js';
import { McpEventBus, mcpEventBus, type McpMutationEvent } from './mcp-event-bus.js';

/** Redis Pub/Sub ignores logical databases, so include that boundary explicitly. */
export function getMcpEventChannel(redisUrl: string, namespace?: string): string {
  const database = Number(new URL(redisUrl).pathname.slice(1) || '0');
  if (!Number.isSafeInteger(database) || database < 0) throw new Error('Invalid Redis database for MCP event bridge.');
  return `gravity:mcp:mutations:v1:${database}:${encodeURIComponent(namespace?.trim() || 'default')}`;
}
const MAX_MESSAGE_BYTES = 512 * 1024;
const EVENT_TYPES = new Set([
  'ticket.created', 'ticket.updated', 'ticket.deleted', 'comment.added', 'comment.updated', 'comment.deleted',
  'labels.added', 'labels.removed', 'labels.set', 'dependency.added', 'dependency.removed', 'subtask.created',
]);

type BridgeClient = {
  isReady: boolean;
  isOpen: boolean;
  connect(): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  subscribe(channel: string, listener: (message: string) => void): Promise<unknown>;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  destroy(): unknown;
};

type BridgeOptions = {
  bus: McpEventBus;
  publisher: BridgeClient;
  subscriber: BridgeClient;
  channel?: string;
  originId?: string;
  maxPending?: number;
  maxSeen?: number;
  log?: (reason: string) => void;
};

function isEvent(value: unknown): value is McpMutationEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.type !== 'string' || !EVENT_TYPES.has(event.type)) return false;
  if (['workspaceId', 'projectId', 'teamId', 'ticketKey', 'actorUserId', 'timestamp']
    .some(field => typeof event[field] !== 'string' || !event[field])) return false;
  return event.data === undefined || (!!event.data && typeof event.data === 'object' && !Array.isArray(event.data));
}

/** Best-effort pubsub: local delivery is synchronous and never depends on Redis availability. */
export function createMcpEventBridge(options: BridgeOptions) {
  const { bus, publisher, subscriber } = options;
  const channel = options.channel ?? getMcpEventChannel(env.redisUrl, env.mcpEventNamespace);
  const originId = options.originId ?? randomUUID();
  const maxPending = options.maxPending ?? 100;
  const maxSeen = options.maxSeen ?? 2_048;
  const seen = new Set<string>();
  const pending = new Set<Promise<unknown>>();
  let stopped = false;
  let lastWarning = -Infinity;
  const warn = (reason: string) => {
    if (stopped || Date.now() - lastWarning < 5_000) return;
    lastWarning = Date.now();
    if (options.log) options.log(reason);
    else console.error(JSON.stringify({ event: 'mcp.event_bridge_warning', reason }));
  };

  publisher.on('error', () => warn('redis_publisher_error'));
  subscriber.on('error', () => warn('redis_subscriber_error'));

  const unsubscribeLocal = bus.subscribeLocal((event) => {
    if (stopped) return;
    if (!publisher.isReady || pending.size >= maxPending) {
      warn(publisher.isReady ? 'publish_capacity_exceeded' : 'redis_not_ready');
      return;
    }
    let message: string;
    try {
      message = JSON.stringify({ version: 1, originId, eventId: randomUUID(), event });
    } catch {
      warn('invalid_local_event');
      return;
    }
    if (Buffer.byteLength(message) > MAX_MESSAGE_BYTES) {
      warn('event_too_large');
      return;
    }
    const publication = Promise.resolve().then(() => publisher.publish(channel, message))
      .catch(() => warn('publish_failed')).finally(() => pending.delete(publication));
    pending.add(publication);
  });

  const receive = (message: string) => {
    if (stopped || Buffer.byteLength(message) > MAX_MESSAGE_BYTES) return;
    try {
      const envelope = JSON.parse(message) as Record<string, unknown>;
      if (envelope.version !== 1 || typeof envelope.originId !== 'string' || typeof envelope.eventId !== 'string'
        || envelope.originId === originId || !isEvent(envelope.event)) return;
      const key = `${envelope.originId}:${envelope.eventId}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (seen.size > maxSeen) seen.delete(seen.values().next().value!);
      bus.receiveRemote(envelope.event);
    } catch {
      warn('invalid_remote_event');
    }
  };

  const ready = Promise.all([publisher.connect(), subscriber.connect()])
    .then(async () => { if (!stopped) await subscriber.subscribe(channel, receive); })
    .catch(() => warn('connect_failed'));

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    unsubscribeLocal();
    // Flush in-flight publishes briefly without allowing unavailable Redis to block shutdown.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...pending]),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, 1_000); timeout.unref?.(); }),
    ]);
    if (timeout) clearTimeout(timeout);
    for (const connection of [subscriber, publisher]) {
      try { if (connection.isOpen) connection.destroy(); } catch { /* Already disconnected. */ }
    }
    seen.clear();
  };

  return { ready, stop };
}

/** Start once at the HTTP/stdio process boundary, returning a graceful cleanup hook. */
export function startMcpEventBridge(): () => Promise<void> {
  if (!env.redisEnabled) return async () => {};
  const redisOptions = {
    url: env.redisUrl,
    disableOfflineQueue: true,
    commandsQueueMaxLength: 128,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: (retries: number) => Math.min(100 * 2 ** Math.min(retries, 6), 5_000),
    },
  };
  const bridge = createMcpEventBridge({
    bus: mcpEventBus,
    publisher: createClient(redisOptions) as BridgeClient,
    subscriber: createClient(redisOptions) as BridgeClient,
  });
  return bridge.stop;
}
