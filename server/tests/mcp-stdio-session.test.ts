import { PassThrough } from 'node:stream';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => vi.resetModules());
beforeEach(() => vi.stubEnv('MCP_STDIO_ALLOW_HANDSHAKE', 'true'));
afterEach(() => vi.unstubAllEnvs());

// Mock internal dependencies (same paths used by the module under test)
vi.mock('../src/modules/mcp/request-handler.js', () => ({
  handleMcpRequest: vi.fn(async (req: any) => ({ jsonrpc: '2.0', id: req?.id ?? null, result: { echoed: true, id: req?.id ?? null } })),
}));
vi.mock('../src/modules/mcp/responses.js', () => ({
  createMcpErrorResponse: (id: any, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } }),
}));
vi.mock('../src/modules/mcp/connection.js', () => ({
  verifyAndConsumeToken: vi.fn(),
  verifyConnectionTokenSession: vi.fn(),
}));
vi.mock('../src/modules/mcp/access.js', () => ({
  isMcpWorkspaceMember: vi.fn(),
}));

import { McpStdioSession } from '../src/modules/mcp/stdio-session.js';
import { verifyAndConsumeToken, verifyConnectionTokenSession } from '../src/modules/mcp/connection.js';
import { handleMcpRequest } from '../src/modules/mcp/request-handler.js';
import { isMcpWorkspaceMember } from '../src/modules/mcp/access.js';

function collectOutput(stream: PassThrough) {
  const chunks: Buffer[] = [];
  stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
  return () => Buffer.concat(chunks).toString('utf8');
}

describe('McpStdioSession framing', () => {
  it('parses framed Content-Length messages and supports explicit legacy framed output', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();
    const readAll = collectOutput(outStream);

    const session = new McpStdioSession(inStream, outStream, { framedOutput: true, maxMessageSize: 1024, workspaceId: 'workspace-1', actorUserId: 'user-1', allowHandshake: true });
    session.start();

    const body = JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'stdio/handshake', params: {} });
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;

    const p = new Promise((res) => outStream.once('data', res));
    inStream.write(header + body);
    // wait for response to be written
    await p;

    const out = readAll();
    session.stop();
    inStream.end();
    outStream.end();
    expect(out).toContain('Content-Length:');
    const idx = out.indexOf('\r\n\r\n');
    expect(idx).toBeGreaterThan(0);
    const respBody = out.slice(idx + 4);
    const parsed = JSON.parse(respBody);
    expect(parsed).toHaveProperty('result');
    expect(parsed.result).toHaveProperty('ok', true);
  });

  it('handles messages split across multiple writes (streaming)', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();
    const readAll = collectOutput(outStream);

    const session = new McpStdioSession(inStream, outStream, { framedOutput: true, maxMessageSize: 1024, workspaceId: 'workspace-1', actorUserId: 'user-1', allowHandshake: true });
    session.start();

    const body = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'stdio/handshake', params: {} });
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;

    // split header and body across writes
    const p2 = new Promise((res) => outStream.once('data', res));
    inStream.write(header.slice(0, 8));
    inStream.write(header.slice(8) + body.slice(0, 5));
    inStream.write(body.slice(5));

    await p2;

    const out = readAll();
    session.stop();
    inStream.end();
    outStream.end();
    const idx = out.indexOf('\r\n\r\n');
    const parsed = JSON.parse(out.slice(idx + 4));
    expect(parsed.id).toBe(7);
    expect(parsed.result).toHaveProperty('ok', true);
  });

  it('rejects declared Content-Length that exceeds maxMessageSize', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();
    const readAll = collectOutput(outStream);

    const session = new McpStdioSession(inStream, outStream, { framedOutput: true, maxMessageSize: 10, workspaceId: 'workspace-1', actorUserId: 'user-1', allowHandshake: true });
    session.start();

    const body = JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'big', params: {} });
    // declare an absurdly large length
    const header = `Content-Length: 99999\r\n\r\n`;

    const p3 = new Promise((res) => outStream.once('data', res));
    inStream.write(header + body);

    await p3;

    const out = readAll();
    session.stop();
    inStream.end();
    outStream.end();
    // Expect an error response produced by createMcpErrorResponse
    expect(out).toContain('Content-Length too large');
  });
});

describe('McpStdioSession token handshake membership guard', () => {
  async function runTokenHandshake() {
    const inStream = new PassThrough();
    const outStream = new PassThrough();
    const readAll = collectOutput(outStream);

    const session = new McpStdioSession(inStream, outStream, { framedOutput: true, maxMessageSize: 4096, allowHandshake: true });
    session.start();

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 100,
      method: 'stdio/handshake',
      params: { token: 'raw-token', workspaceId: 'workspace-1' },
    });
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;

    const p = new Promise((res) => outStream.once('data', res));
    inStream.write(header + body);
    await p;

    const out = readAll();
    session.stop();
    inStream.end();
    outStream.end();

    const idx = out.indexOf('\r\n\r\n');
    return JSON.parse(out.slice(idx + 4));
  }

  it('accepts a token handshake when the issuer is still a workspace member', async () => {
    (verifyAndConsumeToken as any).mockResolvedValueOnce({
      id: 't1',
      workspaceId: 'workspace-1',
      generatedBy: 'user-1',
      scopes: ['tools/list'],
      connectionType: 'stdio',
    });
    (isMcpWorkspaceMember as any).mockResolvedValueOnce(true);

    const parsed = await runTokenHandshake();

    expect(isMcpWorkspaceMember).toHaveBeenCalledWith('workspace-1', 'user-1');
    expect(parsed).toHaveProperty('result');
    expect(parsed.result).toHaveProperty('ok', true);
  });

  it('rejects a token handshake when the issuer is no longer a workspace member', async () => {
    (verifyAndConsumeToken as any).mockResolvedValueOnce({
      id: 't2',
      workspaceId: 'workspace-1',
      generatedBy: 'removed-user',
      scopes: ['tools/list'],
      connectionType: 'stdio',
    });
    (isMcpWorkspaceMember as any).mockResolvedValueOnce(false);

    const parsed = await runTokenHandshake();

    expect(isMcpWorkspaceMember).toHaveBeenCalledWith('workspace-1', 'removed-user');
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toMatchObject({ message: 'Unauthorized workspace access.' });
  });
});


describe('standard MCP stdio lifecycle', () => {
  it('uses newline JSON, accepts CRLF and blank lines, and does not respond to notifications', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const read = collectOutput(output);
    const handler = vi.mocked(handleMcpRequest);
    handler.mockImplementationOnce(async () => null as any);
    const session = new McpStdioSession(input, output, { workspaceId: 'workspace-1', actorUserId: 'user-1' });
    session.start();
    input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\r\n\n');
    const response = new Promise((resolve) => output.once('data', resolve));
    input.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    await response;
    expect(read().split('\n').filter(Boolean).map((line) => JSON.parse(line))).toEqual([
      { jsonrpc: '2.0', id: 2, result: { echoed: true, id: 2 } },
    ]);
    expect(handler).toHaveBeenLastCalledWith(expect.anything(), 'workspace-1', 'user-1', expect.objectContaining({ accessChecked: false }));
    await session.stop();
  });

  it('rechecks revocation/expiry after a token handshake and cannot bypass it with an empty handshake', async () => {
    vi.mocked(verifyAndConsumeToken).mockResolvedValueOnce({ id: 't1', tokenHash: 'hash', singleUse: false, generatedBy: 'user-1', scopes: ['tools/list'] } as any);
    vi.mocked(isMcpWorkspaceMember).mockResolvedValueOnce(true);
    vi.mocked(verifyConnectionTokenSession).mockResolvedValueOnce(null);
    const input = new PassThrough();
    const output = new PassThrough();
    const read = collectOutput(output);
    const session = new McpStdioSession(input, output, { allowHandshake: true });
    session.start();
    const send = async (payload: unknown) => {
      const written = new Promise((resolve) => output.once('data', resolve));
      input.write(JSON.stringify(payload) + '\n');
      await written;
    };
    await send({ jsonrpc: '2.0', id: 1, method: 'stdio/handshake', params: { token: 'token', workspaceId: 'workspace-1' } });
    await send({ jsonrpc: '2.0', id: 2, method: 'stdio/handshake', params: {} });
    await send({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    expect(verifyConnectionTokenSession).toHaveBeenCalledWith('t1', 'workspace-1', 'user-1', 'hash');
    expect(JSON.parse(read().trim().split('\n').at(-1)!)).toMatchObject({ id: 3, error: { message: 'Invalid or expired token.' } });
    await session.stop();
  });
});

describe('stdio handshake attempt protection', () => {
  beforeEach(() => {
    vi.mocked(verifyAndConsumeToken).mockReset().mockResolvedValue(null);
    vi.mocked(isMcpWorkspaceMember).mockReset().mockResolvedValue(true);
    vi.stubEnv('MCP_STDIO_HANDSHAKE_MAX_ATTEMPTS', '2');
    vi.stubEnv('MCP_STDIO_HANDSHAKE_WINDOW_MS', '1000');
  });

  function transport(allowHandshake = true) {
    const input = new PassThrough();
    const output = new PassThrough();
    const session = new McpStdioSession(input, output, { allowHandshake });
    session.start();
    let id = 0;
    return {
      session,
      input,
      output,
      send: (params: unknown = { token: 'synthetic-token', workspaceId: 'test-workspace' }, method = 'stdio/handshake') => {
        const requestId = ++id;
        const response = new Promise<any>((resolve) => {
          const onData = (data: Buffer) => {
            const payload = JSON.parse(String(data));
            if (payload.id !== requestId) return;
            output.removeListener('data', onData);
            resolve(payload);
          };
          output.on('data', onData);
        });
        input.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
        return response;
      },
    };
  }

  function validToken() {
    vi.mocked(verifyAndConsumeToken).mockResolvedValueOnce({
      id: 'synthetic-id', tokenHash: 'synthetic-hash', singleUse: false,
      generatedBy: 'synthetic-user', scopes: ['tools/list'],
    } as any);
  }

  it('bounds queued attempts across changing tokens/workspaces and recovers at expiry without consuming blocked tokens', async () => {
    let now = 10000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const t = transport();
    // Queue multiple requests before verification has completed.
    await Promise.all([t.send(), t.send({ token: 'different-token', workspaceId: 'different-workspace' })]);
    validToken();
    expect((await t.send()).error.code).toBe(-32029);
    expect(verifyAndConsumeToken).toHaveBeenCalledTimes(2);
    now += 1000;
    expect((await t.send()).result.ok).toBe(true);
    expect(verifyAndConsumeToken).toHaveBeenCalledTimes(3);
    await t.session.stop();
  });

  it('resets failures after successful authentication and clears identity on malformed reauthentication', async () => {
    const t = transport();
    await t.send();
    validToken();
    expect((await t.send()).result.ok).toBe(true);
    expect((await t.send({ token: '', workspaceId: '' })).error.code).toBe(-32602);
    expect((await t.send({}, 'tools/list')).error.code).toBe(-32002);
    expect((await t.send()).error.code).toBe(-32001);
    expect((await t.send()).error.code).toBe(-32029);
    await t.session.stop();
  });

  it('does not share lockout with a second session', async () => {
    const first = transport();
    await first.send();
    await first.send();
    const second = transport();
    validToken();
    expect((await second.send()).result.ok).toBe(true);
    expect((await first.send()).error.code).toBe(-32029);
    await first.session.stop();
    await second.session.stop();
  });

  it.each(['malformed', 'single-use', 'membership', 'exception'])('counts %s failures', async (failure) => {
    const t = transport();
    for (let i = 0; i < 2; i++) {
      if (failure === 'single-use') vi.mocked(verifyAndConsumeToken).mockResolvedValueOnce({ singleUse: true } as any);
      if (failure === 'membership') {
        validToken();
        vi.mocked(isMcpWorkspaceMember).mockResolvedValueOnce(false);
      }
      if (failure === 'exception') vi.mocked(verifyAndConsumeToken).mockRejectedValueOnce(new Error('synthetic failure'));
      await t.send(failure === 'malformed' ? { token: 7 } : undefined);
    }
    const calls = vi.mocked(verifyAndConsumeToken).mock.calls.length;
    expect((await t.send()).error.code).toBe(-32029);
    expect(verifyAndConsumeToken).toHaveBeenCalledTimes(calls);
    await t.session.stop();
  });

  it.each([undefined, 'false', 'TRUE', '1'])('requires explicit environment consent (%s)', async (setting) => {
    vi.stubEnv('MCP_STDIO_ALLOW_HANDSHAKE', setting);
    const t = transport();
    expect((await t.send()).error.code).toBe(-32601);
    expect(verifyAndConsumeToken).not.toHaveBeenCalled();
    await t.session.stop();
  });

  it('also requires the embedding application to enable handshakes', async () => {
    const t = transport(false);
    expect((await t.send()).error.code).toBe(-32601);
    expect(verifyAndConsumeToken).not.toHaveBeenCalled();
    await t.session.stop();
  });

  it.each([
    { jsonrpc: '1.0' }, { id: null }, { id: {} }, { id: undefined },
    { params: null }, { params: [] }, { params: 'invalid' },
  ])('counts malformed envelopes without token verification: %j', async (overrides) => {
    const t = transport();
    validToken();
    expect((await t.send()).result.ok).toBe(true);
    for (let i = 0; i < 2; i++) {
      const response = new Promise<any>((resolve) => t.output.once('data', data => resolve(JSON.parse(String(data)))));
      t.input.write(JSON.stringify({ jsonrpc: '2.0', id: 20 + i, method: 'stdio/handshake',
        params: { token: 'synthetic-token', workspaceId: 'test-workspace' }, ...overrides }) + '\n');
      expect((await response).error.code).toBe(-32600);
    }
    expect((await t.send()).error.code).toBe(-32029);
    expect((await t.send({}, 'tools/list')).error.code).toBe(-32002);
    expect(verifyAndConsumeToken).toHaveBeenCalledTimes(1);
    await t.session.stop();
  });

  it('limits a burst of pipelined attempts while draining EOF', async () => {
    const t = transport();
    const responses: any[] = [];
    const completed = new Promise<void>((resolve) => t.output.on('data', data => {
      responses.push(JSON.parse(String(data)));
      if (responses.length === 100) resolve();
    }));
    t.input.end(Array.from({ length: 100 }, (_, id) => JSON.stringify({
      jsonrpc: '2.0', id, method: 'stdio/handshake',
      params: { token: `synthetic-${id}`, workspaceId: `workspace-${id}` },
    })).join('\n') + '\n');
    await completed;
    expect(verifyAndConsumeToken).toHaveBeenCalledTimes(2);
    expect(responses.filter(response => response.error.code === -32029)).toHaveLength(98);
    expect(responses.map(response => response.id)).toEqual(Array.from({ length: 100 }, (_, id) => id));
    await t.session.stop();
  });

  it('does not extend lockout when repeated blocked requests arrive', async () => {
    let now = 10000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const t = transport();
    await t.send();
    await t.send();
    now += 999;
    expect((await t.send()).error.code).toBe(-32029);
    now += 1;
    validToken();
    expect((await t.send()).result.ok).toBe(true);
    await t.session.stop();
  });

  it.each(['MCP_STDIO_HANDSHAKE_MAX_ATTEMPTS', 'MCP_STDIO_HANDSHAKE_WINDOW_MS'])('rejects invalid %s guards', (key) => {
    for (const value of ['0', '-1', '', 'NaN', 'Infinity', '1.5', '1junk', '9007199254740992']) {
      vi.stubEnv(key, value);
      expect(() => transport()).toThrow(`${key} must be a positive safe integer.`);
    }
  });
});
