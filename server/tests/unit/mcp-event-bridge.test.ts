import { describe, expect, it, vi } from 'vitest';
import { createMcpEventBridge, getMcpEventChannel, startMcpEventBridge } from '../../src/lib/mcp-event-bridge.js';
import { McpEventBus, type McpMutationEvent } from '../../src/lib/mcp-event-bus.js';

const event: McpMutationEvent = {
  type: 'ticket.updated', workspaceId: 'workspace-a', projectId: 'project-a', teamId: 'team-a',
  ticketKey: 'GRV-1', actorUserId: 'user-a', timestamp: '2026-09-23T00:00:00.000Z', data: { ticketId: 'ticket-a' },
};

function fakeClient() {
  return {
    isReady: true, isOpen: true,
    listener: undefined as ((message: string) => void) | undefined,
    connect: vi.fn(async () => {}),
    publish: vi.fn(async (_channel: string, _message: string): Promise<unknown> => 1),
    subscribe: vi.fn(async function (this: { listener?: (message: string) => void }, _channel: string, listener: (message: string) => void) { this.listener = listener; }),
    on: vi.fn(), destroy: vi.fn(),
  };
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

describe('cross-process MCP event bridge', () => {
  it('isolates Redis databases and deployment namespaces while matching processes relay', async () => {
    const listeners = new Map<string, Array<(message: string) => void>>();
    const channels = [
      getMcpEventChannel('redis://synthetic:credential@redis:6379/1', 'staging'),
      getMcpEventChannel('redis://other:credential@redis:6379/01', 'staging'),
      getMcpEventChannel('redis://redis:6379/2', 'staging'),
      getMcpEventChannel('redis://redis:6379/1', 'production'),
    ];
    expect(channels[0]).toBe('gravity:mcp:mutations:v1:1:staging');
    expect(getMcpEventChannel('redis://redis:6379')).toBe(getMcpEventChannel('redis://redis:6379/0'));
    const received = channels.map(() => vi.fn());
    const buses = channels.map(() => new McpEventBus());
    const bridges = channels.map((channel, index) => {
      const publisher = fakeClient();
      const subscriber = fakeClient();
      subscriber.subscribe.mockImplementation(async (name, listener) => {
        listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      });
      publisher.publish.mockImplementation(async (name, message) => {
        for (const listener of listeners.get(name) ?? []) listener(message);
        return 1;
      });
      buses[index].subscribeAll(received[index]);
      return createMcpEventBridge({ bus: buses[index], publisher, subscriber, channel });
    });
    try {
      await Promise.all(bridges.map(bridge => bridge.ready));
      buses[0].publish(event);
      await flush();
      expect(received[0]).toHaveBeenCalledExactlyOnceWith(event);
      expect(received[1]).toHaveBeenCalledExactlyOnceWith(event);
      expect(received[2]).not.toHaveBeenCalled();
      expect(received[3]).not.toHaveBeenCalled();
    } finally {
      await Promise.all(bridges.map(bridge => bridge.stop()));
    }
  });

  it('forwards to another process once, keeps workspace isolation and never republishes remote events', async () => {
    const firstBus = new McpEventBus();
    const secondBus = new McpEventBus();
    const firstPublisher = fakeClient();
    const firstSubscriber = fakeClient();
    const secondPublisher = fakeClient();
    const secondSubscriber = fakeClient();
    const first = createMcpEventBridge({ bus: firstBus, publisher: firstPublisher, subscriber: firstSubscriber, originId: 'first' });
    const second = createMcpEventBridge({ bus: secondBus, publisher: secondPublisher, subscriber: secondSubscriber, originId: 'second' });
    await Promise.all([first.ready, second.ready]);
    const local = vi.fn();
    const remote = vi.fn();
    const wrongWorkspace = vi.fn();
    firstBus.subscribe(event.workspaceId, local);
    secondBus.subscribe(event.workspaceId, remote);
    secondBus.subscribe('other-workspace', wrongWorkspace);
    firstBus.publish(event);
    expect(local).toHaveBeenCalledTimes(1);
    await flush();
    const message = firstPublisher.publish.mock.calls[0][1];
    firstSubscriber.listener!(message);
    secondSubscriber.listener!(message);
    secondSubscriber.listener!(message);
    expect(local).toHaveBeenCalledTimes(1);
    expect(remote).toHaveBeenCalledExactlyOnceWith(event);
    expect(wrongWorkspace).not.toHaveBeenCalled();
    expect(secondPublisher.publish).not.toHaveBeenCalled();
    await Promise.all([first.stop(), second.stop()]);
  });

  it('preserves immediate local delivery offline and bounds in-flight publishes', async () => {
    const bus = new McpEventBus();
    const publisher = fakeClient();
    const subscriber = fakeClient();
    const log = vi.fn();
    const bridge = createMcpEventBridge({ bus, publisher, subscriber, maxPending: 2, log });
    await bridge.ready;
    const local = vi.fn();
    bus.subscribeAll(local);
    publisher.isReady = false;
    bus.publish(event);
    expect(local).toHaveBeenCalledTimes(1);
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('redis_not_ready');
    publisher.isReady = true;
    let resolve!: () => void;
    const pending = new Promise<void>(done => { resolve = done; });
    publisher.publish.mockImplementation(() => pending);
    for (let index = 0; index < 10; index++) bus.publish(event);
    await flush();
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(local).toHaveBeenCalledTimes(11);
    resolve();
    await bridge.stop();
    expect(publisher.destroy).toHaveBeenCalledOnce();
    expect(subscriber.destroy).toHaveBeenCalledOnce();
    bus.publish(event);
    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed messages and catches asynchronous publication errors', async () => {
    const bus = new McpEventBus();
    const publisher = fakeClient();
    const subscriber = fakeClient();
    const log = vi.fn();
    const bridge = createMcpEventBridge({ bus, publisher, subscriber, log });
    await bridge.ready;
    const local = vi.fn();
    bus.subscribeAll(local);
    for (const message of ['garbage', '{}', JSON.stringify({ version: 1, originId: 'other', eventId: 'bad', event: { ...event, workspaceId: null } })]) {
      subscriber.listener!(message);
    }
    expect(local).not.toHaveBeenCalled();
    publisher.publish.mockRejectedValue(new Error('Offline'));
    bus.publish(event);
    await flush();
    expect(local).toHaveBeenCalledExactlyOnceWith(event);
    expect(log).toHaveBeenCalled();
    await bridge.stop();
  });

  it('does not connect when Redis is disabled', async () => {
    await expect(startMcpEventBridge()()).resolves.toBeUndefined();
  });
});
