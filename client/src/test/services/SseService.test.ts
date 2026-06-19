import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SseService,
  disposeSseService,
  getSseService,
  resetSseServiceRegistryForTest,
} from '../../services/sseService';

type MessageHandler = (event: MessageEvent) => void;
type ErrorHandler = (event: Event) => void;

class MockEventSource {
  public onmessage: MessageHandler | null = null;
  public onerror: ErrorHandler | null = null;
  public onopen: ErrorHandler | null = null;
  public close = vi.fn();

  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly errorHandlers = new Set<ErrorHandler>();
  private readonly openHandlers = new Set<ErrorHandler>();

  public readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: 'message' | 'error' | 'open', handler: MessageHandler | ErrorHandler): void {
    if (type === 'message') {
      this.messageHandlers.add(handler as MessageHandler);
      return;
    }
    if (type === 'error') {
      this.errorHandlers.add(handler as ErrorHandler);
      return;
    }
    this.openHandlers.add(handler as ErrorHandler);
  }

  removeEventListener(type: 'message' | 'error' | 'open', handler: MessageHandler | ErrorHandler): void {
    if (type === 'message') {
      this.messageHandlers.delete(handler as MessageHandler);
      return;
    }
    if (type === 'error') {
      this.errorHandlers.delete(handler as ErrorHandler);
      return;
    }
    this.openHandlers.delete(handler as ErrorHandler);
  }

  emitMessage(data: string): void {
    const event = new MessageEvent('message', { data });
    if (this.onmessage) {
      this.onmessage(event);
    }
    for (const handler of this.messageHandlers) {
      handler(event);
    }
  }

  emitError(): void {
    const event = new Event('error');
    if (this.onerror) {
      this.onerror(event);
    }
    for (const handler of this.errorHandlers) {
      handler(event);
    }
  }

  emitOpen(): void {
    const event = new Event('open');
    if (this.onopen) {
      this.onopen(event);
    }
    for (const handler of this.openHandlers) {
      handler(event);
    }
  }
}

function createMockEventSourceFactory() {
  const instances: MockEventSource[] = [];
  const eventSourceFactory = vi.fn((url: string) => {
    const source = new MockEventSource(url);
    instances.push(source);
    return source as unknown as EventSource;
  });
  return { eventSourceFactory, instances };
}

afterEach(() => {
  vi.useRealTimers();
  resetSseServiceRegistryForTest();
});

describe('SseService', () => {
  it('opens a connection for a workspace and emits SSE messages', () => {
    const { eventSourceFactory, instances } = createMockEventSourceFactory();
    const service = new SseService({
      apiBasePath: '/api/v1',
      eventSourceFactory,
      maxRetries: 0,
    });

    const messageSpy = vi.fn();
    const ticketsUpdatedSpy = vi.fn();

    service.on('message', messageSpy);
    service.on('tickets-updated', ticketsUpdatedSpy);
    service.connect('workspace-1');

    expect(instances).toHaveLength(1);
    expect(instances[0].url).toBe('/api/v1/events/subscribe?workspaceId=workspace-1');
    expect(eventSourceFactory).toHaveBeenCalledWith(
      '/api/v1/events/subscribe?workspaceId=workspace-1',
      { withCredentials: true },
    );

    instances[0].emitMessage(JSON.stringify({ type: 'tickets-updated', data: { projectId: 'project-1' } }));

    expect(messageSpy).toHaveBeenCalledTimes(1);
    expect(ticketsUpdatedSpy).toHaveBeenCalledTimes(1);
    const typedEvent = ticketsUpdatedSpy.mock.calls[0][0] as MessageEvent;
    expect(typeof typedEvent.data).toBe('string');
    expect(JSON.parse(typedEvent.data)).toMatchObject({ type: 'tickets-updated', data: { projectId: 'project-1' } });
  });

  it('disconnects by closing source and removing source listeners', () => {
    const { eventSourceFactory, instances } = createMockEventSourceFactory();
    const service = new SseService({ eventSourceFactory });
    const messageSpy = vi.fn();

    service.on('message', messageSpy);
    service.connect('workspace-1');
    instances[0].emitMessage('{"type":"tickets-updated","data":{}}');

    service.disconnect();

    instances[0].emitMessage('{"type":"tickets-updated","data":{}}');
    expect(messageSpy).toHaveBeenCalledTimes(1);
    expect(instances[0].close).toHaveBeenCalledTimes(1);
  });

  it('supports detaching handlers with off()', () => {
    const { eventSourceFactory, instances } = createMockEventSourceFactory();
    const service = new SseService({ eventSourceFactory });
    const messageSpy = vi.fn();

    service.on('message', messageSpy);
    service.off('message', messageSpy);
    service.connect('workspace-1');

    instances[0].emitMessage('{"type":"tickets-updated","data":{}}');
    expect(messageSpy).toHaveBeenCalledTimes(0);
  });

  it('supports concurrent consumers without interrupting active connections', () => {
    const { eventSourceFactory, instances } = createMockEventSourceFactory();
    const service = new SseService({ eventSourceFactory });
    const firstConsumer = vi.fn();
    const secondConsumer = vi.fn();

    service.on('message', firstConsumer);
    service.on('message', secondConsumer);

    service.connect('workspace-1');
    service.connect('workspace-1');

    instances[0].emitMessage('{"type":"tickets-updated","data":{}}');
    expect(firstConsumer).toHaveBeenCalledTimes(1);
    expect(secondConsumer).toHaveBeenCalledTimes(1);

    service.disconnect();
    instances[0].emitMessage('{"type":"tickets-updated","data":{}}');
    expect(firstConsumer).toHaveBeenCalledTimes(2);
    expect(secondConsumer).toHaveBeenCalledTimes(2);

    service.disconnect();
    instances[0].emitMessage('{"type":"tickets-updated","data":{}}');
    expect(firstConsumer).toHaveBeenCalledTimes(2);
    expect(secondConsumer).toHaveBeenCalledTimes(2);
    expect(instances[0].close).toHaveBeenCalledTimes(1);
  });

  it('retries with exponential backoff and jitter-aware delay', () => {
    vi.useFakeTimers();
    const { eventSourceFactory, instances } = createMockEventSourceFactory();
    const service = new SseService({
      apiBasePath: '/api/v1',
      eventSourceFactory,
      maxRetries: 2,
      baseDelayMs: 1000,
      jitterFactor: 0,
    });

    service.connect('workspace-1');
    expect(instances).toHaveLength(1);

    instances[0].emitError();
    vi.advanceTimersByTime(999);
    expect(instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(2);

    instances[1].emitError();
    vi.advanceTimersByTime(1999);
    expect(instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(3);

    instances[2].emitError();
    vi.advanceTimersByTime(4000);
    expect(instances).toHaveLength(3);
  });

  it('reconnect() closes and immediately opens with reset retry attempts', () => {
    const { eventSourceFactory, instances } = createMockEventSourceFactory();
    const service = new SseService({ eventSourceFactory, baseDelayMs: 1000, maxRetries: 3 });

    service.connect('workspace-1');
    service.disconnect();
    service.reconnect();
    expect(instances).toHaveLength(2);
  });

  it('disposes listeners and prevents reconnect after cleanup', () => {
    const { eventSourceFactory, instances } = createMockEventSourceFactory();
    const service = new SseService({ eventSourceFactory });
    const messageSpy = vi.fn();

    service.on('message', messageSpy);
    service.connect('workspace-1');
    instances[0].emitMessage('{"type":"tickets-updated","data":{}}');

    service.dispose();
    instances[0].emitMessage('{"type":"tickets-updated","data":{}}');

    expect(messageSpy).toHaveBeenCalledTimes(1);
    service.connect('workspace-1');
    expect(instances).toHaveLength(1);
  });

  it('reuses one service instance per workspace and disposes only when idle', () => {
    const { eventSourceFactory, instances } = createMockEventSourceFactory();
    const serviceA = getSseService('workspace-single', {
      apiBasePath: '/api/v1',
      eventSourceFactory,
    });
    const serviceB = getSseService('workspace-single');

    expect(serviceA).toBe(serviceB);

    serviceA.connect('workspace-single');
    serviceB.connect('workspace-single');
    expect(instances).toHaveLength(1);

    disposeSseService('workspace-single');
    serviceA.disconnect();
    serviceB.disconnect();
    disposeSseService('workspace-single');

    const serviceC = getSseService('workspace-single', {
      apiBasePath: '/api/v1',
      eventSourceFactory,
    });
    serviceC.connect('workspace-single');
    expect(instances).toHaveLength(2);

    disposeSseService('workspace-single');
    expect(serviceC).not.toBe(serviceA);
  });

  it('warns when requesting a cached workspace service with conflicting options', () => {
    const { eventSourceFactory, instances } = createMockEventSourceFactory();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const serviceA = getSseService('workspace-warning', {
      apiBasePath: '/api/v1',
      eventSourceFactory,
      maxRetries: 3,
    });
    const serviceB = getSseService('workspace-warning', {
      apiBasePath: '/api/v2',
      eventSourceFactory,
      maxRetries: 3,
    });

    expect(serviceA).toBe(serviceB);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SseService options conflict for workspace "workspace-warning". ')
    );

    serviceA.connect('workspace-warning');
    expect(instances).toHaveLength(1);

    warnSpy.mockRestore();
  });

  it('does not warn when reusing a cached workspace service without explicit options', () => {
    const { eventSourceFactory, instances } = createMockEventSourceFactory();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const serviceA = getSseService('workspace-no-options-warning', {
      apiBasePath: '/api/v1',
      eventSourceFactory,
      maxRetries: 3,
    });
    const serviceB = getSseService('workspace-no-options-warning');

    expect(serviceA).toBe(serviceB);
    expect(warnSpy).toHaveBeenCalledTimes(0);

    serviceA.connect('workspace-no-options-warning');
    expect(instances).toHaveLength(1);

    warnSpy.mockRestore();
  });
});
