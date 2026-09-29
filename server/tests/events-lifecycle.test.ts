import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  activeConnectionCount, addClient, broadcastEvent, broadcastToWorkspace,
  closeSseConnections, disconnectSseConnection, disconnectSseConnectionsByToken,
  hasRoomForSseConnection, MAX_SSE_BUFFERED_BYTES, SSE_HEARTBEAT_INTERVAL_MS,
  SSE_SHUTDOWN_GRACE_MS, SSE_DRAIN_TIMEOUT_MS, subscribeToEvents,
} from '../src/realtime.js';
import * as lifecycle from '../src/lib/server-lifecycle.js';
import * as requestAuth from '../src/modules/auth/utils/request-auth.js';
import * as workspaceAccess from '../src/modules/mcp/access.js';
import * as logger from '../src/lib/logger.js';
import { createApp } from '../src/app.js';

class Stream extends EventEmitter {
  socket = Object.assign(new EventEmitter(), {
    destroyed: false,
    end: vi.fn(),
    destroy: vi.fn(() => { this.socket.destroyed = true; this.socket.emit('close'); }),
  });
  writableLength = 0;
  writableEnded = false;
  destroyed = false;
  closed = false;
  write = vi.fn((_frame: string) => true);
  end = vi.fn(() => { this.writableEnded = true; });
  destroy = vi.fn(() => { this.destroyed = true; this.closed = true; this.emit('close'); });
  response() { return this as unknown as Response; }
}
const streams: Stream[] = [];
function connect(workspace = 'workspace', userId = 'user') {
  const stream = new Stream();
  streams.push(stream);
  addClient(workspace, stream.response(), { userId, sourceIp: null, tokenId: 'token', authMethod: 'token' });
  return stream;
}
beforeEach(() => { vi.spyOn(logger, 'audit').mockImplementation(() => {}); });
afterEach(() => {
  for (const stream of streams.splice(0)) disconnectSseConnection(stream.response(), 'test_cleanup');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SSE bounded stream lifecycle', () => {
  it('never queues further events behind a stalled writer or interrupts healthy peers', () => {
    const stalled = connect();
    const healthy = connect('workspace', 'other-user');
    const unrelated = connect('elsewhere');
    stalled.write.mockReturnValue(false);
    for (let i = 0; i < 1000; i++) broadcastToWorkspace('workspace', 'change', { i });
    expect(stalled.write).toHaveBeenCalledTimes(1);
    expect(stalled.destroy).toHaveBeenCalledOnce();
    expect(healthy.write).toHaveBeenCalledTimes(1000);
    expect(unrelated.write).not.toHaveBeenCalled();
    expect(activeConnectionCount()).toBe(2);
    broadcastEvent('all', {});
    expect(unrelated.write).toHaveBeenCalledOnce();
  });

  it('allows a single backpressured frame to drain and resume normal delivery', () => {
    vi.useFakeTimers();
    const stream = connect();
    stream.write.mockReturnValueOnce(false);
    broadcastEvent('large', {});
    expect(stream.destroy).not.toHaveBeenCalled();
    stream.emit('drain');
    vi.advanceTimersByTime(SSE_DRAIN_TIMEOUT_MS);
    broadcastEvent('next', {});
    expect(stream.write).toHaveBeenCalledTimes(2);
    expect(stream.destroy).not.toHaveBeenCalled();
  });

  it('bounds the lifetime of a stalled write even when no further events arrive', () => {
    vi.useFakeTimers();
    const stream = connect();
    stream.write.mockReturnValue(false);
    broadcastEvent('change', {});
    vi.advanceTimersByTime(SSE_DRAIN_TIMEOUT_MS);
    expect(stream.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(stream.listenerCount('drain')).toBe(0);
  });

  it.each(['workspace', 'global'])('sends bounded resync notifications for large UTF-8 payloads (%s)', scope => {
    const stream = connect();
    const other = connect('other-workspace');
    const data = { ticket: { description: 'é'.repeat(MAX_SSE_BUFFERED_BYTES / 2) } };
    if (scope === 'workspace') broadcastToWorkspace('workspace', 'tickets-updated', data);
    else broadcastEvent('tickets-updated', data);
    const frame = stream.write.mock.calls[0][0];
    expect(frame.endsWith('\n\n')).toBe(true);
    expect(JSON.parse(frame.slice(6).trim())).toEqual({ type: 'resync-required', data: {} });
    expect(Buffer.byteLength(frame)).toBeLessThan(MAX_SSE_BUFFERED_BYTES);
    expect(stream.destroy).not.toHaveBeenCalled();
    expect(other.write).toHaveBeenCalledTimes(scope === 'workspace' ? 0 : 1);
    broadcastToWorkspace('workspace', 'change', { title: 'next event' });
    expect(stream.write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(stream.write.mock.calls[1][0].slice(6).trim())).toMatchObject({ type: 'change' });
  });

  it('enforces the pending byte cap before writing', () => {
    const stream = connect();
    stream.writableLength = MAX_SSE_BUFFERED_BYTES - 1;
    broadcastToWorkspace('workspace', 'change', {});
    expect(stream.write).not.toHaveBeenCalled();
    expect(stream.destroy).toHaveBeenCalledOnce();
    expect(activeConnectionCount()).toBe(0);
  });

  it.each(['error', 'close', 'throw', 'revocation'] as const)('releases registries, listeners and heartbeat after %s', mode => {
    vi.useFakeTimers();
    const stream = connect();
    vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS);
    expect(stream.write).toHaveBeenCalledWith(': heartbeat\n\n');
    if (mode === 'error') stream.emit('error', new Error('broken socket'));
    if (mode === 'close') stream.emit('close');
    if (mode === 'throw') {
      stream.write.mockImplementation(() => { throw new Error('write failed'); });
      broadcastEvent('change', {});
    }
    if (mode === 'revocation') expect(disconnectSseConnectionsByToken('token')).toBe(1);
    expect(activeConnectionCount()).toBe(0);
    expect(hasRoomForSseConnection('user')).toBe(true);
    expect(disconnectSseConnectionsByToken('token')).toBe(0);
    expect(stream.listenerCount('close')).toBe(0);
    expect(stream.listenerCount('error')).toBe(0);
    expect(stream.listenerCount('drain')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the same backpressure handling for heartbeats', () => {
    vi.useFakeTimers();
    const stream = connect();
    stream.write.mockReturnValue(false);
    vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS * 3);
    expect(stream.write).toHaveBeenCalledOnce();
    expect(activeConnectionCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finishes healthy streams and destroys a stalled shutdown stream within the grace period', async () => {
    vi.useFakeTimers();
    const healthy = connect();
    healthy.end.mockImplementation(() => { healthy.emit('finish'); healthy.emit('close'); });
    healthy.socket.end.mockImplementation(() => { healthy.socket.emit('close'); });
    const stalled = connect();
    // Finishing the response must not cancel the socket's destruction deadline.
    stalled.end.mockImplementation(() => { stalled.emit('finish'); stalled.emit('close'); });
    const closed = closeSseConnections();
    expect(activeConnectionCount()).toBe(0);
    expect(healthy.end).toHaveBeenCalledOnce();
    expect(healthy.destroy).not.toHaveBeenCalled();
    expect(stalled.socket.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SSE_SHUTDOWN_GRACE_MS);
    await closed;
    expect(stalled.socket.destroy).toHaveBeenCalledOnce();
    expect(stalled.socket.listenerCount('close')).toBe(0);
    expect(stalled.socket.listenerCount('error')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(stalled.listenerCount('error')).toBe(0);
    expect(stalled.listenerCount('close')).toBe(0);
  });

  it('cleans up all streams even when disconnect audit logging fails', async () => {
    const stream = connect();
    vi.spyOn(logger, 'audit').mockImplementation(() => { throw new Error('sink unavailable'); });
    vi.spyOn(logger, 'securityAlert').mockImplementation(() => {});
    disconnectSseConnection(stream.response(), 'test');
    expect(stream.destroy).toHaveBeenCalledOnce();
    expect(activeConnectionCount()).toBe(0);
  });

  it('marks readiness unavailable and rejects subscriptions during shutdown', async () => {
    vi.spyOn(lifecycle, 'isServerShuttingDown').mockReturnValue(true);
    const app = createApp();
    for (const path of ['/', '/api/v1/health', '/api/v1/events/subscribe?workspaceId=workspace']) {
      expect((await request(app).get(path)).status).toBe(503);
    }
  });

  it('rejects an authenticated subscription if shutdown starts while authentication is pending', async () => {
    const state = vi.spyOn(lifecycle, 'isServerShuttingDown').mockReturnValue(false);
    let finishAuth!: (value: string) => void;
    vi.spyOn(requestAuth, 'resolveRequestActorUserId').mockImplementation(() => new Promise(resolve => { finishAuth = resolve; }));
    vi.spyOn(workspaceAccess, 'isMcpWorkspaceMember').mockResolvedValue(true);
    const req = { query: { workspaceId: 'workspace' }, header: () => undefined } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), writeHead: vi.fn() } as unknown as Response;
    const subscription = subscribeToEvents(req, res);
    state.mockReturnValue(true);
    finishAuth('user');
    await subscription;
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.writeHead).not.toHaveBeenCalled();
    expect(activeConnectionCount()).toBe(0);
  });
});
