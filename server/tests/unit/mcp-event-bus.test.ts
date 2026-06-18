import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpEventBus, type McpMutationEvent } from '../../src/lib/mcp-event-bus';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<McpMutationEvent> = {}): McpMutationEvent {
  return {
    type: 'ticket.created',
    workspaceId: 'ws-alpha',
    projectId: 'proj-1',
    teamId: 'team-1',
    ticketKey: 'ALPHA-1',
    actorUserId: 'user-1',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('McpEventBus', () => {
  let bus: McpEventBus;

  beforeEach(() => {
    bus = new McpEventBus();
  });

  // ── Basic publish / subscribe ────────────────────────────────────────────

  it('delivers a published event to a workspace subscriber', () => {
    const handler = vi.fn();
    bus.subscribe('ws-alpha', handler);

    const event = makeEvent();
    bus.publish(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does NOT deliver to a subscriber for a different workspace', () => {
    const handlerAlpha = vi.fn();
    const handlerBeta = vi.fn();
    bus.subscribe('ws-alpha', handlerAlpha);
    bus.subscribe('ws-beta', handlerBeta);

    bus.publish(makeEvent({ workspaceId: 'ws-alpha' }));

    expect(handlerAlpha).toHaveBeenCalledOnce();
    expect(handlerBeta).not.toHaveBeenCalled();
  });

  it('delivers to all subscribers registered for the same workspace', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe('ws-alpha', h1);
    bus.subscribe('ws-alpha', h2);

    bus.publish(makeEvent({ workspaceId: 'ws-alpha' }));

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  // ── Unsubscribe ──────────────────────────────────────────────────────────

  it('stops delivering to a handler after the returned unsubscribe is called', () => {
    const handler = vi.fn();
    const unsub = bus.subscribe('ws-alpha', handler);

    bus.publish(makeEvent({ workspaceId: 'ws-alpha' }));
    expect(handler).toHaveBeenCalledOnce();

    unsub();
    bus.publish(makeEvent({ workspaceId: 'ws-alpha' }));
    expect(handler).toHaveBeenCalledOnce(); // still only once
  });

  it('removes the internal listener when unsubscribed (listenerCount → 0)', () => {
    const unsub = bus.subscribe('ws-alpha', vi.fn());
    expect(bus.listenerCount('ws-alpha')).toBe(1);
    unsub();
    expect(bus.listenerCount('ws-alpha')).toBe(0);
  });

  // ── subscribeAll ─────────────────────────────────────────────────────────

  it('subscribeAll receives events for every workspace', () => {
    const global = vi.fn();
    bus.subscribeAll(global);

    bus.publish(makeEvent({ workspaceId: 'ws-alpha' }));
    bus.publish(makeEvent({ workspaceId: 'ws-beta' }));

    expect(global).toHaveBeenCalledTimes(2);
  });

  it('subscribeAll receives events even when no workspace subscriber exists', () => {
    const global = vi.fn();
    bus.subscribeAll(global);

    bus.publish(makeEvent({ workspaceId: 'ws-gamma' }));

    expect(global).toHaveBeenCalledOnce();
  });

  it('subscribeAll unsubscribe stops delivery', () => {
    const global = vi.fn();
    const unsub = bus.subscribeAll(global);

    bus.publish(makeEvent());
    unsub();
    bus.publish(makeEvent());

    expect(global).toHaveBeenCalledOnce();
  });

  // ── Payload fidelity ─────────────────────────────────────────────────────

  it('passes the complete event payload to the subscriber unchanged', () => {
    const received: McpMutationEvent[] = [];
    bus.subscribe('ws-alpha', (e) => received.push(e));

    const event = makeEvent({
      type: 'labels.added',
      workspaceId: 'ws-alpha',
      projectId: 'proj-42',
      teamId: 'team-99',
      ticketKey: 'ALPHA-99',
      actorUserId: 'user-bot',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { addedLabels: ['bug', 'urgent'], finalLabels: ['bug', 'urgent'] },
    });

    bus.publish(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toStrictEqual(event);
  });

  it('forwards the correct event type literal', () => {
    const types: string[] = [];
    bus.subscribe('ws-alpha', (e) => types.push(e.type));

    const eventTypes = [
      'ticket.created', 'ticket.updated', 'ticket.deleted',
      'comment.added', 'comment.updated', 'comment.deleted',
      'labels.added', 'labels.removed', 'labels.set',
      'dependency.added', 'dependency.removed',
      'subtask.created',
    ] as const;

    for (const type of eventTypes) {
      bus.publish(makeEvent({ type }));
    }

    expect(types).toEqual([...eventTypes]);
  });

  // ── Workspace isolation ──────────────────────────────────────────────────

  it('two workspaces are fully isolated from each other', () => {
    const alphaSpy = vi.fn();
    const betaSpy = vi.fn();
    bus.subscribe('ws-alpha', alphaSpy);
    bus.subscribe('ws-beta', betaSpy);

    // Publish 3 events to alpha, 2 to beta
    bus.publish(makeEvent({ workspaceId: 'ws-alpha', ticketKey: 'A-1' }));
    bus.publish(makeEvent({ workspaceId: 'ws-alpha', ticketKey: 'A-2' }));
    bus.publish(makeEvent({ workspaceId: 'ws-beta',  ticketKey: 'B-1' }));
    bus.publish(makeEvent({ workspaceId: 'ws-alpha', ticketKey: 'A-3' }));
    bus.publish(makeEvent({ workspaceId: 'ws-beta',  ticketKey: 'B-2' }));

    expect(alphaSpy).toHaveBeenCalledTimes(3);
    expect(betaSpy).toHaveBeenCalledTimes(2);

    const alphaKeys = alphaSpy.mock.calls.map(([e]: [McpMutationEvent]) => e.ticketKey);
    const betaKeys  = betaSpy.mock.calls.map(([e]: [McpMutationEvent]) => e.ticketKey);

    expect(alphaKeys).toEqual(['A-1', 'A-2', 'A-3']);
    expect(betaKeys).toEqual(['B-1', 'B-2']);
  });

  // ── Event includes required scope fields ────────────────────────────────

  it('published events always include workspaceId, projectId, and teamId', () => {
    const received: McpMutationEvent[] = [];
    bus.subscribeAll((e) => received.push(e));

    bus.publish(makeEvent({
      workspaceId: 'ws-abc',
      projectId: 'proj-xyz',
      teamId: 'team-123',
    }));

    expect(received[0].workspaceId).toBe('ws-abc');
    expect(received[0].projectId).toBe('proj-xyz');
    expect(received[0].teamId).toBe('team-123');
  });
});
