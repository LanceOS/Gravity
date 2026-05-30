import { PassThrough } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';

// Mock the internal request handler and error response helper so tests are isolated.
vi.mock('./request-handler.js', () => ({
  handleMcpRequest: vi.fn(async (req: any) => ({ jsonrpc: '2.0', id: req?.id ?? null, result: { echoed: true, id: req?.id ?? null } })),
}));
vi.mock('./responses.js', () => ({
  createMcpErrorResponse: (id: any, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } }),
}));

import { McpStdioSession } from './stdio-session.js';

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

    const session = new McpStdioSession(inStream, outStream, { maxMessageSize: 1024 });
    session.start();

    const body = JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'noop', params: {} });
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;

    inStream.write(header + body);

    // wait for response to be written
    await new Promise((res) => outStream.once('data', res));

    const out = readAll();
    expect(out).toContain('Content-Length:');
    const idx = out.indexOf('\r\n\r\n');
    expect(idx).toBeGreaterThan(0);
    const respBody = out.slice(idx + 4);
    const parsed = JSON.parse(respBody);
    expect(parsed).toHaveProperty('result');
    expect(parsed.result).toHaveProperty('echoed', true);
  });

  it('handles messages split across multiple writes (streaming)', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();
    const readAll = collectOutput(outStream);

    const session = new McpStdioSession(inStream, outStream, { maxMessageSize: 1024 });
    session.start();

    const body = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'chunk', params: {} });
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;

    // split header and body across writes
    inStream.write(header.slice(0, 8));
    inStream.write(header.slice(8) + body.slice(0, 5));
    inStream.write(body.slice(5));

    await new Promise((res) => outStream.once('data', res));

    const out = readAll();
    const idx = out.indexOf('\r\n\r\n');
    const parsed = JSON.parse(out.slice(idx + 4));
    expect(parsed.id).toBe(7);
    expect(parsed.result).toHaveProperty('echoed', true);
  });

  it('rejects declared Content-Length that exceeds maxMessageSize', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();
    const readAll = collectOutput(outStream);

    const session = new McpStdioSession(inStream, outStream, { maxMessageSize: 10 });
    session.start();

    const body = JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'big', params: {} });
    // declare an absurdly large length
    const header = `Content-Length: 99999\r\n\r\n`;

    inStream.write(header + body);

    await new Promise((res) => outStream.once('data', res));

    const out = readAll();
    // Expect an error response produced by createMcpErrorResponse
    expect(out).toContain('Message');
    expect(out).toContain('Content-Length too large');
  });
});
