type SseListener = (event: MessageEvent | Event) => void;
type EventSourceFactory = (url: string, init?: EventSourceInit) => EventSource;

interface SseServiceOptions {
  apiBasePath?: string;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
  eventSourceFactory?: EventSourceFactory;
}

interface SseServiceInternalOptions {
  apiBasePath: string;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  eventSourceFactory: EventSourceFactory;
}

type WorkspaceSseConfig = {
  apiBasePath: string;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  eventSourceFactory?: EventSourceFactory;
};

const DEFAULT_OPTIONS: SseServiceInternalOptions = {
  apiBasePath: '/api/v1',
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2,
  eventSourceFactory: (url: string) => new EventSource(url),
};

const normalizeOptions = (options: SseServiceOptions = {}): SseServiceInternalOptions => ({
  ...DEFAULT_OPTIONS,
  ...options,
});

const normalizeWorkspaceConfigForWarning = (options: SseServiceOptions = {}): WorkspaceSseConfig => {
  const normalized = normalizeOptions(options);
  return {
    apiBasePath: normalized.apiBasePath,
    maxRetries: normalized.maxRetries,
    baseDelayMs: normalized.baseDelayMs,
    maxDelayMs: normalized.maxDelayMs,
    jitterFactor: normalized.jitterFactor,
    eventSourceFactory: normalized.eventSourceFactory,
  };
};

const areWorkspaceConfigsEquivalent = (left: WorkspaceSseConfig, right: WorkspaceSseConfig): boolean => {
  return (
    left.apiBasePath === right.apiBasePath &&
    left.maxRetries === right.maxRetries &&
    left.baseDelayMs === right.baseDelayMs &&
    left.maxDelayMs === right.maxDelayMs &&
    left.jitterFactor === right.jitterFactor &&
    left.eventSourceFactory === right.eventSourceFactory
  );
};

const formatServiceOptionDiff = (left: WorkspaceSseConfig, right: WorkspaceSseConfig) => ({
  current: {
    apiBasePath: left.apiBasePath,
    maxRetries: left.maxRetries,
    baseDelayMs: left.baseDelayMs,
    maxDelayMs: left.maxDelayMs,
    jitterFactor: left.jitterFactor,
    usesCustomEventSourceFactory: !!left.eventSourceFactory,
  },
  requested: {
    apiBasePath: right.apiBasePath,
    maxRetries: right.maxRetries,
    baseDelayMs: right.baseDelayMs,
    maxDelayMs: right.maxDelayMs,
    jitterFactor: right.jitterFactor,
    usesCustomEventSourceFactory: !!right.eventSourceFactory,
  },
});

export class SseService {
  private options: SseServiceInternalOptions;
  private listeners = new Map<string, Set<SseListener>>();
  private eventSource: EventSource | null = null;
  private currentWorkspaceId: string | null = null;
  private retryAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private isDisposed = false;
  private activeConnections = 0;

  constructor(options: SseServiceOptions = {}) {
    this.options = normalizeOptions(options);
  }

  connect(workspaceId: string): void {
    if (this.isDisposed || !workspaceId) {
      return;
    }

    const normalizedWorkspaceId = String(workspaceId);

    if (this.currentWorkspaceId === normalizedWorkspaceId && this.eventSource) {
      this.activeConnections += 1;
      this.shouldReconnect = true;
      this.clearReconnectTimer();
      return;
    }

    this.activeConnections += 1;

    this.currentWorkspaceId = normalizedWorkspaceId;
    this.retryAttempts = 0;
    this.shouldReconnect = true;
    this.tearDown();
    this.open();
  }

  disconnect(): void {
    if (this.activeConnections > 0) {
      this.activeConnections -= 1;
    }

    if (this.activeConnections > 0) {
      return;
    }

    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.tearDown();
    this.listeners.clear();
  }

  reconnect(): void {
    const workspaceId = this.currentWorkspaceId;
    if (!workspaceId || this.isDisposed) {
      return;
    }

    this.shouldReconnect = true;
    this.retryAttempts = 0;
    this.clearReconnectTimer();
    this.tearDown();
    this.currentWorkspaceId = workspaceId;
    this.open();
  }

  dispose(): void {
    this.disconnect();
    this.currentWorkspaceId = null;
    this.isDisposed = true;
  }

  on(eventType: string, handler: SseListener): void {
    if (!eventType || !handler) {
      return;
    }
    let handlers = this.listeners.get(eventType);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(eventType, handlers);
    }
    handlers.add(handler);
  }

  off(eventType: string, handler: SseListener): void {
    const handlers = this.listeners.get(eventType);
    if (!handlers) {
      return;
    }
    handlers.delete(handler);
    if (handlers.size === 0) {
      this.listeners.delete(eventType);
    }
  }

  private open(): void {
    if (!this.currentWorkspaceId || this.isDisposed || !this.shouldReconnect) {
      return;
    }

    if (typeof EventSource === 'undefined' && this.options.eventSourceFactory === DEFAULT_OPTIONS.eventSourceFactory) {
      return;
    }

    const apiUrl = `${this.options.apiBasePath.replace(/\/$/, '')}/events/subscribe?workspaceId=${encodeURIComponent(this.currentWorkspaceId)}`;

    let source: EventSource;
    try {
      source = this.options.eventSourceFactory(apiUrl, { withCredentials: true });
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.eventSource = source;
    this.bind(source);
  }

  private buildRetryDelayMs(): number {
    const exponentialDelay = Math.min(this.options.maxDelayMs, this.options.baseDelayMs * (2 ** this.retryAttempts));
    const jitter = exponentialDelay * this.options.jitterFactor;
    const jitterOffset = jitter === 0
      ? 0
      : ((Math.random() * 2 - 1) * jitter);
    return Math.max(0, Math.round(exponentialDelay + jitterOffset));
  }

  private scheduleReconnect(): void {
    const workspaceId = this.currentWorkspaceId;
    if (!workspaceId || this.isDisposed || !this.shouldReconnect) {
      return;
    }

    if (this.retryAttempts >= this.options.maxRetries) {
      return;
    }

    const delayMs = this.buildRetryDelayMs();
    this.retryAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isDisposed && this.shouldReconnect) {
        this.tearDown();
        this.open();
      }
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private bind(source: EventSource): void {
    this.attachSourceListener(source, 'message', this.handleMessage);
    this.attachSourceListener(source, 'error', this.handleError);
    this.attachSourceListener(source, 'open', this.handleOpen);
  }

  private tearDown(): void {
    this.clearReconnectTimer();

    if (!this.eventSource) {
      return;
    }

    this.removeSourceListener(this.eventSource, 'message', this.handleMessage);
    this.removeSourceListener(this.eventSource, 'error', this.handleError);
    this.removeSourceListener(this.eventSource, 'open', this.handleOpen);
    this.eventSource.close();
    this.eventSource = null;
  }

  isDisconnectable(): boolean {
    return this.activeConnections <= 0;
  }

  private emit(eventType: string, event: MessageEvent | Event): void {
    const handlers = this.listeners.get(eventType);
    if (!handlers) {
      return;
    }
    for (const handler of Array.from(handlers)) {
      handler(event);
    }
  }

  private parseMessageData(rawData: unknown): unknown | null {
    if (typeof rawData !== 'string') {
      return null;
    }

    try {
      const data = JSON.parse(rawData);
      return typeof data === 'object' && data !== null ? data : null;
    } catch {
      return null;
    }
  }

  private dispatchTypedEvent(rawData: string): void {
    const parsed = this.parseMessageData(rawData);
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed) || typeof (parsed as { type: unknown }).type !== 'string') {
      return;
    }

    const eventType = (parsed as { type: string }).type;
    const syntheticEvent = new MessageEvent(eventType, { data: rawData });
    Object.defineProperty(syntheticEvent, 'rawData', {
      enumerable: false,
      value: rawData,
    });
    this.emit(eventType, syntheticEvent);
  }

  private handleMessage = (event: MessageEvent): void => {
    this.emit('message', event);
    if (typeof event.data === 'string') {
      this.dispatchTypedEvent(event.data);
    }
  };

  private handleOpen = (): void => {
    this.retryAttempts = 0;
    this.clearReconnectTimer();
  };

  private handleError = (_event: Event): void => {
    this.emit('error', _event);
    if (!this.shouldReconnect || this.isDisposed) {
      return;
    }

    this.tearDown();
    this.scheduleReconnect();
  };

  private attachSourceListener(
    source: EventSource,
    eventType: 'message' | 'error' | 'open',
    handler: (event: MessageEvent | Event) => void
  ): void {
    const sourceAsAny = source as unknown as {
      addEventListener?: (type: string, listener: any) => void;
      onmessage?: ((event: MessageEvent) => void) | null;
      onerror?: ((event: Event) => void) | null;
      onopen?: ((event: Event) => void) | null;
    };

    if (typeof sourceAsAny.addEventListener === 'function') {
      sourceAsAny.addEventListener(eventType, handler as EventListener);
      return;
    }

    if (eventType === 'message') {
      sourceAsAny.onmessage = handler as (event: MessageEvent) => void;
      return;
    }
    if (eventType === 'error') {
      sourceAsAny.onerror = handler as (event: Event) => void;
      return;
    }
    if (eventType === 'open') {
      sourceAsAny.onopen = handler as (event: Event) => void;
    }
  }

  private removeSourceListener(
    source: EventSource,
    eventType: 'message' | 'error' | 'open',
    handler: (event: MessageEvent | Event) => void
  ): void {
    const sourceAsAny = source as unknown as {
      removeEventListener?: (type: string, listener: any) => void;
      onmessage?: ((event: MessageEvent) => void) | null;
      onerror?: ((event: Event) => void) | null;
      onopen?: ((event: Event) => void) | null;
    };

    if (typeof sourceAsAny.removeEventListener === 'function') {
      sourceAsAny.removeEventListener(eventType, handler as EventListener);
      return;
    }

    if (eventType === 'message') {
      sourceAsAny.onmessage = null;
      return;
    }
    if (eventType === 'error') {
      sourceAsAny.onerror = null;
      return;
    }
    if (eventType === 'open') {
      sourceAsAny.onopen = null;
    }
  }
}

type WorkspaceServiceRegistry = Map<string, SseService>;
type WorkspaceServiceOptionRegistry = Map<string, WorkspaceSseConfig>;
const registry: WorkspaceServiceRegistry = new Map();
const registryOptions: WorkspaceServiceOptionRegistry = new Map();

export function getSseService(workspaceId: string, options: SseServiceOptions = {}): SseService {
  const normalizedWorkspaceId = String(workspaceId);

  if (registry.has(normalizedWorkspaceId)) {
    const service = registry.get(normalizedWorkspaceId)!;
    const existingOptions = registryOptions.get(normalizedWorkspaceId);

    if (Object.keys(options).length > 0 && existingOptions && !areWorkspaceConfigsEquivalent(existingOptions, normalizeWorkspaceConfigForWarning(options))) {
      const diff = formatServiceOptionDiff(existingOptions, normalizeWorkspaceConfigForWarning(options));
      const workspaceIdMessage = normalizedWorkspaceId;
      const diffMessage = JSON.stringify(diff);
      console.warn(`SseService options conflict for workspace "${workspaceIdMessage}". ` +
        `Using existing service settings. Requested settings were: ${diffMessage}`);
    }

    return service;
  }
  const service = new SseService(options);
  const normalizedOptions = normalizeWorkspaceConfigForWarning(options);
  registry.set(normalizedWorkspaceId, service);
  registryOptions.set(normalizedWorkspaceId, normalizedOptions);
  return service;
}

export function disposeSseService(workspaceId: string): void {
  const service = registry.get(String(workspaceId));
  if (!service) {
    return;
  }
  if (service.isDisconnectable()) {
    service.dispose();
    registry.delete(String(workspaceId));
    registryOptions.delete(String(workspaceId));
  }
}

export function resetSseServiceRegistryForTest(): void {
  for (const workspaceId of Array.from(registry.keys())) {
    const service = registry.get(workspaceId);
    if (!service) {
      continue;
    }
    service.dispose();
    registry.delete(workspaceId);
    registryOptions.delete(workspaceId);
  }
}
