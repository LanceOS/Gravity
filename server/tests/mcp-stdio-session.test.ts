import { PassThrough } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => vi.resetModules());

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
