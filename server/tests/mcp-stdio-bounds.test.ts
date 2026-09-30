import { PassThrough, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared setup imports MCP modules before this suite registers its mocks.
vi.hoisted(() => vi.resetModules());
vi.mock('../src/modules/mcp/request-handler.js', () => ({ handleMcpRequest: vi.fn() }));
vi.mock('../src/modules/mcp/connection.js', () => ({ verifyAndConsumeToken: vi.fn(), verifyConnectionTokenSession: vi.fn() }));
vi.mock('../src/modules/mcp/access.js', () => ({ isMcpWorkspaceMember: vi.fn() }));
import { McpStdioSession, type McpSessionOptions } from '../src/modules/mcp/stdio-session.js';
import { handleMcpRequest } from '../src/modules/mcp/request-handler.js';
import { verifyAndConsumeToken, verifyConnectionTokenSession } from '../src/modules/mcp/connection.js';
import { isMcpWorkspaceMember } from '../src/modules/mcp/access.js';

const handler = vi.mocked(handleMcpRequest);
const sessions: McpStdioSession[] = [];
const frame = (id: number) => JSON.stringify({ jsonrpc: '2.0', id, method: 'ping' }) + '\n';
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};
async function flush() { for (let i = 0; i < 25; i++) await Promise.resolve(); }
function fixture(options: McpSessionOptions = {}, output: Writable = new PassThrough()) {
  const input = new PassThrough();
  const messages: any[] = [];
  if (output instanceof PassThrough) output.on('data', chunk => messages.push(JSON.parse(String(chunk))));
  const onStop = vi.fn();
  const sessionOptions = {
    workspaceId: 'synthetic-workspace', actorUserId: 'synthetic-user',
    requestTimeoutMs: 100, drainTimeoutMs: 100, onStop, ...options,
  };
  const session = new McpStdioSession(input, output, sessionOptions);
  sessions.push(session);
  session.start();
  return { session, input, output, messages, onStop, sessionOptions };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  handler.mockImplementation(async (request: any) => ({ jsonrpc: '2.0', id: request.id, result: {} }));
});
afterEach(async () => {
  await Promise.all(sessions.splice(0).map(session => session.stop()));
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('bounded stdio execution and lifecycle', () => {
  it('retires a stalled session at its deadline, discards queued work and ignores a late result', async () => {
    const stalled = deferred<any>();
    handler.mockReturnValueOnce(stalled.promise);
    const t = fixture();
    t.input.write(frame(1) + frame(2));
    await vi.advanceTimersByTimeAsync(100);
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    stalled.resolve({ jsonrpc: '2.0', id: 1, result: {} });
    await flush();
    t.session.start();
    t.input.emit('data', frame(3));
    expect(t.messages).toEqual([]);
    expect(handler).toHaveBeenCalledTimes(1);
    await t.session.stop();
    expect(t.onStop).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('bounds a coalesced small-frame flood (Content-Length: %s)', async framed => {
    handler.mockReturnValue(new Promise(() => {}));
    const t = fixture({ maxPendingRequests: 4 });
    t.input.write(Array.from({ length: 1000 }, (_, id) => {
      const line = frame(id);
      return framed ? `Content-Length: ${Buffer.byteLength(line)}\r\n\r\n${line}` : line;
    }).join(''));
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(t.messages).toEqual([]);
  });

  it('bounds queued bytes even below the request count limit', async () => {
    handler.mockReturnValue(new Promise(() => {}));
    const t = fixture({ maxPendingBytes: Buffer.byteLength(frame(1)) + 1 });
    t.input.write(frame(1) + frame(2));
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(t.onStop).toHaveBeenCalledTimes(1);
  });

  it('preserves FIFO at the exact limit and drains accepted requests on EOF', async () => {
    const t = fixture({ maxPendingRequests: 4 });
    t.input.end(frame(1) + frame(2) + frame(3) + frame(4));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.messages.map(message => message.id)).toEqual([1, 2, 3, 4]);
    expect(t.onStop).toHaveBeenCalledTimes(1);
  });

  it('bounds EOF independently of a longer request timeout', async () => {
    handler.mockReturnValue(new Promise(() => {}));
    const t = fixture({ requestTimeoutMs: 1000, drainTimeoutMs: 20 });
    t.input.end(frame(1) + frame(2));
    await vi.advanceTimersByTimeAsync(20);
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each(['stop', 'input close', 'output close', 'output finish', 'input error', 'output error'])('%s abandons active work without waiting or dispatching pending work', async reason => {
    const stalled = deferred<any>();
    handler.mockReturnValue(stalled.promise);
    const t = fixture();
    t.input.write(frame(1) + frame(2));
    if (reason === 'stop') await t.session.stop();
    else {
      const [side, event] = reason.split(' ');
      (side === 'input' ? t.input : t.output).emit(event, event === 'error' ? new Error('synthetic') : undefined);
    }
    await flush();
    expect(t.onStop).toHaveBeenCalledTimes(1);
    stalled.resolve({ jsonrpc: '2.0', id: 1, result: {} });
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(t.messages).toEqual([]);
  });

  it('does not dispatch requests when started with an already-ended output', async () => {
    const output = new PassThrough();
    output.end();
    const t = fixture({}, output);
    t.input.write(frame(1));
    await flush();
    expect(handler).not.toHaveBeenCalled();
    expect(t.onStop).toHaveBeenCalledTimes(1);
  });

  it('stops dispatch while output is backpressured and resumes FIFO on drain', async () => {
    let release!: () => void;
    const output = new Writable({ highWaterMark: 1, write(_chunk, _encoding, callback) { release = callback; } });
    const t = fixture({}, output);
    t.input.write(frame(1) + frame(2));
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(t.input.isPaused()).toBe(true);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.input.isPaused()).toBe(false);
  });

  it('bounds stalled output without invoking more handlers', async () => {
    const output = new Writable({ highWaterMark: 1, write() {} });
    const t = fixture({}, output);
    t.input.write(frame(1) + frame(2));
    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(output.listenerCount('drain')).toBe(0);
  });

  it('resumes input after drain callbacks release the exact output budget', async () => {
    let release!: () => void;
    const output = new Writable({ highWaterMark: 1, write(_chunk, _encoding, callback) { release = callback; } });
    const t = fixture({ maxPendingRequests: 1 }, output);
    t.input.write(frame(1));
    await flush();
    t.input.write(frame(2)); // buffered by the paused input, not yet admitted
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(t.onStop).not.toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for an accepted write callback before completing EOF', async () => {
    let release!: () => void;
    const output = new Writable({ write(_chunk, _encoding, callback) { release = callback; } });
    const t = fixture({}, output);
    t.input.end(frame(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.onStop).not.toHaveBeenCalled();
    release();
    await flush();
    expect(t.onStop).toHaveBeenCalledTimes(1);
  });

  it('bounds a stalled write even below the high water mark', async () => {
    const output = new Writable({ write() {} });
    const t = fixture({}, output);
    t.input.write(frame(1));
    await vi.advanceTimersByTimeAsync(100);
    expect(t.onStop).toHaveBeenCalledTimes(1);
  });

  it('counts writes held by a writable with a large high water mark', async () => {
    const output = new Writable({ highWaterMark: 1024 * 1024, write() {} });
    const t = fixture({ maxPendingRequests: 2 }, output);
    t.session.send({ result: 1 });
    t.session.send({ result: 2 });
    t.session.send({ result: 3 });
    await flush();
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(output.writableLength).toBe(Buffer.byteLength('{"result":1}\n{"result":2}\n'));
  });

  it('counts bytes held by a writable even without backpressure', async () => {
    const output = new Writable({ highWaterMark: 1024 * 1024, write() {} });
    const t = fixture({ maxPendingBytes: 20 }, output);
    t.session.send({ result: 1 });
    t.session.send({ result: 2 });
    await flush();
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(output.writableLength).toBe(Buffer.byteLength('{"result":1}\n'));
  });

  it('rejects oversized raw chunks without starting a handler', async () => {
    const t = fixture({ maxMessageSize: 64 });
    t.input.write(' '.repeat(64 * 1024 + 65));
    await flush();
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles a late write error after stop and releases error guards on close', async () => {
    let fail!: (error: Error) => void;
    const output = new Writable({ write(_chunk, _encoding, callback) { fail = callback; } });
    const t = fixture({}, output);
    t.input.write(frame(1));
    await flush();
    await t.session.stop();
    fail(new Error('late synthetic failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(output.listenerCount('error')).toBe(0);
    expect(output.listenerCount('close')).toBe(0);
  });

  it('bounds parse-error output from a flood in an already-read chunk', async () => {
    const output = new Writable({ highWaterMark: 1, write() {} });
    const t = fixture({ maxPendingRequests: 4 }, output);
    t.input.write('invalid\n'.repeat(100));
    await flush();
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not install identity or start membership lookup after a stopped handshake resolves', async () => {
    vi.stubEnv('MCP_STDIO_ALLOW_HANDSHAKE', 'true');
    const verification = deferred<any>();
    vi.mocked(verifyAndConsumeToken).mockReturnValue(verification.promise);
    const t = fixture({ allowHandshake: true });
    t.input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'stdio/handshake', params: { token: 'synthetic-token', workspaceId: 'synthetic-workspace' } }) + '\n');
    await vi.waitFor(() => expect(verifyAndConsumeToken).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(100);
    verification.resolve({ id: 'token', generatedBy: 'user', scopes: [], tokenHash: 'hash', singleUse: false });
    await flush();
    expect(isMcpWorkspaceMember).not.toHaveBeenCalled();
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(t.messages).toEqual([]);
  });

  it('does not restore identity when membership resolves after stop', async () => {
    vi.stubEnv('MCP_STDIO_ALLOW_HANDSHAKE', 'true');
    vi.mocked(verifyAndConsumeToken).mockResolvedValue({ id: 'token', generatedBy: 'user', scopes: [], tokenHash: 'hash', singleUse: false } as any);
    const membership = deferred<boolean>();
    vi.mocked(isMcpWorkspaceMember).mockReturnValue(membership.promise);
    const t = fixture({ allowHandshake: true, requestTimeoutMs: 1000 });
    t.input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'stdio/handshake', params: { token: 'synthetic-token', workspaceId: 'synthetic-workspace' } }) + '\n');
    await vi.waitFor(() => expect(isMcpWorkspaceMember).toHaveBeenCalledTimes(1));
    await t.session.stop();
    membership.resolve(true);
    await flush();
    expect(t.sessionOptions.workspaceId).toBeUndefined();
    expect(t.sessionOptions.actorUserId).toBeUndefined();
    expect(t.messages).toEqual([]);
  });

  it('does not dispatch a tool after token revalidation resolves in a stopped session', async () => {
    vi.stubEnv('MCP_STDIO_ALLOW_HANDSHAKE', 'true');
    vi.mocked(verifyAndConsumeToken).mockResolvedValue({ id: 'token', generatedBy: 'user', scopes: [], tokenHash: 'hash', singleUse: false } as any);
    vi.mocked(isMcpWorkspaceMember).mockResolvedValue(true);
    const t = fixture({ allowHandshake: true, requestTimeoutMs: 1000 });
    t.input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'stdio/handshake', params: { token: 'synthetic-token', workspaceId: 'synthetic-workspace' } }) + '\n');
    await vi.waitFor(() => expect(t.messages).toHaveLength(1));
    const verification = deferred<any>();
    vi.mocked(verifyConnectionTokenSession).mockReturnValue(verification.promise);
    t.input.write(frame(2));
    await vi.waitFor(() => expect(verifyConnectionTokenSession).toHaveBeenCalledTimes(1));
    await t.session.stop();
    verification.resolve({ scopes: ['tools/call'] });
    await flush();
    expect(handler).not.toHaveBeenCalled();
    expect(t.sessionOptions.tokenScopes).toEqual([]);
    expect(t.messages).toHaveLength(1);
  });

  it('removes only its own listeners and shares the stop completion promise', async () => {
    const t = fixture();
    const external = vi.fn();
    t.input.on('data', external);
    const first = t.session.stop();
    expect(t.session.stop()).toBe(first);
    await first;
    expect(t.input.listeners('data')).toEqual([external]);
    expect(t.onStop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['maxPendingRequests', 'maxPendingBytes', 'maxMessageSize', 'requestTimeoutMs', 'drainTimeoutMs'] as const)('rejects invalid %s', key => {
    for (const value of [0, -1, NaN, Infinity, 1.5]) {
      expect(() => new McpStdioSession(new PassThrough(), new PassThrough(), { [key]: value })).toThrow(key);
    }
  });
});
