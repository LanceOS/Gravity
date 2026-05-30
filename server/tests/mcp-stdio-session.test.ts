import { PassThrough } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';

// Mock internal dependencies (same paths used by the module under test)
vi.mock('../src/modules/mcp/request-handler.js', () => ({
  handleMcpRequest: vi.fn(async (req: any) => ({ jsonrpc: '2.0', id: req?.id ?? null, result: { echoed: true, id: req?.id ?? null } })),
}));
vi.mock('../src/modules/mcp/responses.js', () => ({
  createMcpErrorResponse: (id: any, code: number, message: string) => {
    // debug trace for tests
    // eslint-disable-next-line no-console
    console.log('MOCK createMcpErrorResponse called:', code, message);
    return { jsonrpc: '2.0', id, error: { code, message } };
  },
}));

import { McpStdioSession } from '../src/modules/mcp/stdio-session.js';

function collectOutput(stream: PassThrough) {
  const chunks: Buffer[] = [];
  stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
  return () => Buffer.concat(chunks).toString('utf8');
}

describe('McpStdioSession framing', () => {
  it('parses framed Content-Length messages and responds framed by default', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();
    const readAll = collectOutput(outStream);

    const session = new McpStdioSession(inStream, outStream, { maxMessageSize: 1024, workspaceId: 'workspace-1', actorUserId: 'user-1', allowHandshake: true });
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
    // debug: dump the raw response body
    // eslint-disable-next-line no-console
    console.log('STDIO-RESPONSE-BODY:', respBody);
    const parsed = JSON.parse(respBody);
    expect(parsed).toHaveProperty('result');
    expect(parsed.result).toHaveProperty('ok', true);
  });

  it('handles messages split across multiple writes (streaming)', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();
    const readAll = collectOutput(outStream);

    const session = new McpStdioSession(inStream, outStream, { maxMessageSize: 1024, workspaceId: 'workspace-1', actorUserId: 'user-1', allowHandshake: true });
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

    const session = new McpStdioSession(inStream, outStream, { maxMessageSize: 10, workspaceId: 'workspace-1', actorUserId: 'user-1', allowHandshake: true });
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
