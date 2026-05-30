import type { Readable, Writable } from 'node:stream';
import { handleMcpRequest } from './request-handler.js';
import { createMcpErrorResponse } from './responses.js';
import {
  ERR_MISSING_CONTENT_LENGTH,
  ERR_INVALID_CONTENT_LENGTH,
  ERR_CONTENT_LENGTH_TOO_LARGE,
  ERR_MESSAGE_TOO_LARGE,
} from './transport-error-codes.js';

/**
 * Options for the stdio session.
 * `maxMessageSize` is a defensive guard (bytes) to avoid unbounded buffering.
 */
export type McpSessionOptions = {
  workspaceId?: string | null;
  actorUserId?: string | null;
  sanitize?: boolean;
  tokenScopes?: string[] | undefined;
  allowHandshake?: boolean;
  // Maximum allowed message size in bytes. Defaults to 10 MiB.
  maxMessageSize?: number;
  // When true, responses will be written in the legacy newline-delimited
  // JSON format instead of Content-Length framed responses. Default: false.
  legacyOutput?: boolean;
};

// Default maximum allowed message size in bytes. Exported for reuse.
export const DEFAULT_MAX_MESSAGE_SIZE = 10 * 1024 * 1024;

/**
 * McpStdioSession implements a Content-Length framed protocol (LSP-style)
 * for robustness when reading from stdio. It also accepts the legacy
 * single-line JSON messages as a fallback (but those must remain compact
 * single-line JSON objects).
 */
export class McpStdioSession {
  // Efficient chunk queue to avoid repeated Buffer.concat on each data event.
  private chunks: Buffer[] = [];
  private totalLength = 0;
  private running = false;
  private maxMessageSize: number;
  // Queue for outgoing messages when the writable signals backpressure.
  private sendQueue: string[] = [];
  private backpressureActive = false;
  // Bound drain handler so we can add/remove the listener reliably.
  private onDrain = () => {
    this.backpressureActive = false;
    // Flush queued messages in FIFO order.
    while (this.sendQueue.length > 0) {
      const next = this.sendQueue.shift()!;
      const ok = this.output.write(next);
      if (!ok) {
        // Still backpressured; wait for the next drain.
        this.backpressureActive = true;
        this.output.once('drain', this.onDrain);
        return;
      }
    }

    // Queue drained — resume input if it was paused.
    try {
      // resume is idempotent if not paused
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - `resume` exists on Readable
      this.input.resume();
    } catch (e) {
      // best-effort
    }
  };
  // Serializes request handling to avoid races (handshake mutates session state).
  private processingPromise: Promise<void> = Promise.resolve();

  constructor(private input: Readable, private output: Writable, private options: McpSessionOptions = {}) {
    this.maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
  }

  start() {
    if (this.running) return;
    this.running = true;

    this.input.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      this.appendChunk(buf);
      try {
        this.processBuffer();
      } catch (err) {
        // Defensive: avoid crashing the process on malformed input.
        try {
          this.send(createMcpErrorResponse(null, -32603, 'Internal parser error'));
        } catch (_e) {
          // best-effort
        }
        this.clearChunks();
      }
    });

    this.input.on('end', () => this.stop());
    this.input.on('error', () => this.stop());
  }

  private processBuffer() {
    // Loop to extract multiple messages if present in the chunk queue.
    const MAX_HEADER_SCAN = 64 * 1024; // reasonable header limit
    while (this.totalLength > 0) {
      // Peek up to header scan limit to find header terminator.
      const peekLen = Math.min(this.totalLength, MAX_HEADER_SCAN);
      const peek = this.peekUpTo(peekLen);

      let headerEnd = peek.indexOf('\r\n\r\n');
      let headerTermLen = 4;
      if (headerEnd === -1) {
        headerEnd = peek.indexOf('\n\n');
        if (headerEnd !== -1) headerTermLen = 2;
      }

      if (headerEnd !== -1) {
        // We have a header block available in `peek` buffer (within MAX_HEADER_SCAN).
        const headerBlock = peek.slice(0, headerEnd).toString('ascii');

        const m = headerBlock.match(/Content-Length:\s*(\d+)/i);
        if (!m) {
          // Header block present but missing Content-Length — reject explicitly.
          this.consumeBytes(headerEnd + headerTermLen);
          this.send(createMcpErrorResponse(null, ERR_MISSING_CONTENT_LENGTH, 'Missing Content-Length header'));
          continue;
        }

        const length = parseInt(m[1], 10);
        if (!Number.isFinite(length) || length < 0) {
          this.consumeBytes(headerEnd + headerTermLen);
          this.send(createMcpErrorResponse(null, ERR_INVALID_CONTENT_LENGTH, 'Invalid Content-Length header'));
          continue;
        }

        // Early guard: reject declared lengths that exceed configured limit.
        if (length > this.maxMessageSize) {
          this.consumeBytes(headerEnd + headerTermLen);
          this.send(createMcpErrorResponse(null, ERR_CONTENT_LENGTH_TOO_LARGE, 'Content-Length too large'));
          continue;
        }

        const totalNeeded = headerEnd + headerTermLen + length;
        if (this.totalLength < totalNeeded) {
          // Not enough data yet; wait for more.
          if (this.totalLength > this.maxMessageSize) {
            this.clearChunks();
            this.send(createMcpErrorResponse(null, ERR_MESSAGE_TOO_LARGE, 'Message too large'));
          }
          return;
        }

        // Consume header and body as a contiguous message.
        this.consumeBytes(headerEnd + headerTermLen); // drop header
        const bodyBuf = this.readBytes(length);
        const bodyStr = bodyBuf.toString('utf8');
        this.handleRawJson(bodyStr);
        continue;
      }

      // No header terminator found within the scanned window. If we don't have
      // any header and there's at least one newline, treat as legacy single-line JSON.
      const nlIndex = this.indexOfByte(0x0a); // '\n'
      if (nlIndex !== -1) {
        const lineBuf = this.readBytes(nlIndex);
        // consume the newline
        this.consumeBytes(1);
        const line = lineBuf.toString('utf8');
        if (!line.trim()) continue;
        this.handleRawJson(line);
        continue;
      }

      // Not enough data yet and no newline/header found. Enforce max size guard.
        if (this.totalLength > this.maxMessageSize) {
          this.clearChunks();
          this.send(createMcpErrorResponse(null, ERR_MESSAGE_TOO_LARGE, 'Message too large'));
        }
      return;
    }
  }

  // ----- chunk-queue helpers -----
  private appendChunk(buf: Buffer) {
    if (!buf || buf.length === 0) return;
    this.chunks.push(buf);
    this.totalLength += buf.length;
  }

  private clearChunks() {
    this.chunks.length = 0;
    this.totalLength = 0;
  }

  private peekUpTo(n: number): Buffer {
    if (n <= 0) return Buffer.alloc(0);
    if (this.chunks.length === 0) return Buffer.alloc(0);
    if (this.chunks.length === 1 && this.chunks[0].length >= n) return this.chunks[0].slice(0, n);
    const out = Buffer.alloc(Math.min(n, this.totalLength));
    let offset = 0;
    for (const c of this.chunks) {
      const take = Math.min(c.length, out.length - offset);
      if (take <= 0) break;
      c.copy(out, offset, 0, take);
      offset += take;
      if (offset >= out.length) break;
    }
    return out;
  }

  private readBytes(n: number): Buffer {
    if (n <= 0) return Buffer.alloc(0);
    if (n > this.totalLength) throw new Error('read past end');
    const out = Buffer.alloc(n);
    let off = 0;
    while (off < n) {
      const c = this.chunks[0];
      const take = Math.min(c.length, n - off);
      c.copy(out, off, 0, take);
      off += take;
      if (take === c.length) {
        this.chunks.shift();
      } else {
        this.chunks[0] = c.slice(take);
      }
    }
    this.totalLength -= n;
    return out;
  }

  private consumeBytes(n: number) {
    if (n <= 0) return;
    if (n > this.totalLength) {
      // consume everything
      this.clearChunks();
      return;
    }
    // Efficiently discard n bytes using readBytes without allocating result.
    let remaining = n;
    while (remaining > 0 && this.chunks.length > 0) {
      const c = this.chunks[0];
      if (c.length <= remaining) {
        remaining -= c.length;
        this.chunks.shift();
      } else {
        this.chunks[0] = c.slice(remaining);
        remaining = 0;
      }
    }
    this.totalLength -= n - remaining;
  }

  private indexOfByte(byte: number): number {
    let idx = 0;
    for (const c of this.chunks) {
      const pos = c.indexOf(byte);
      if (pos !== -1) return idx + pos;
      idx += c.length;
    }
    return -1;
  }

  private handleRawJson(raw: string) {
    let request: unknown;
    try {
      request = JSON.parse(raw);
    } catch (err) {
      this.send(createMcpErrorResponse(null, -32700, 'Parse error'));
      return;
    }

    // Serialize request handling to avoid races (handshake mutates session state).
    this.processingPromise = this.processingPromise.then(() => this.delegateRequest(request)).catch(() => {});
  }

  private async delegateRequest(request: unknown) {
    const payload = request as any;

    // Optional handshake flow for dynamic token-based auth.
    if (this.options.allowHandshake && payload?.method === 'stdio/handshake') {
      const params = payload.params ?? {};
      const token = typeof params.token === 'string' ? params.token.trim() : '';
      const workspaceId = typeof params.workspaceId === 'string' ? params.workspaceId.trim() : '';

      if (token && workspaceId) {
        try {
          const { verifyAndConsumeToken } = await import('./connection.js');
          const tokenRow = await verifyAndConsumeToken(token, workspaceId, {});
          if (!tokenRow) {
            this.send(createMcpErrorResponse(payload.id ?? null, -32001, 'Invalid or expired token.'));
            return;
          }
          this.options.workspaceId = workspaceId;
          this.options.actorUserId = tokenRow.generatedBy;
          this.options.tokenScopes = Array.isArray(tokenRow.scopes) ? tokenRow.scopes : [];
          this.send({ jsonrpc: '2.0', id: payload.id ?? null, result: { ok: true } });
          return;
        } catch (err) {
          this.send(createMcpErrorResponse(payload.id ?? null, -32603, 'Handshake failed.'));
          return;
        }
      }

      if (!this.options.workspaceId || !this.options.actorUserId) {
        this.send(createMcpErrorResponse(payload.id ?? null, -32602, 'Handshake requires workspaceId and token or pre-configured context.'));
        return;
      }

      this.send({ jsonrpc: '2.0', id: payload.id ?? null, result: { ok: true } });
      return;
    }

    const workspaceId = this.options.workspaceId ?? '';
    const actorUserId = this.options.actorUserId ?? '';

    if (!workspaceId || !actorUserId) {
      this.send(createMcpErrorResponse(payload?.id ?? null, -32002, 'Authentication required.'));
      return;
    }

    try {
      const resp = await handleMcpRequest(request, workspaceId, actorUserId, {
        accessChecked: Array.isArray(this.options.tokenScopes),
        sanitize: !!this.options.sanitize,
        tokenScopes: this.options.tokenScopes,
      });
      this.send(resp);
    } catch (err) {
      this.send(createMcpErrorResponse(payload?.id ?? null, -32603, err instanceof Error ? err.message : String(err)));
    }
  }

  send(msg: unknown) {
    try {
      const s = JSON.stringify(msg);
      // Prepare payload
      const payload = this.options.legacyOutput ? s + '\n' : `Content-Length: ${Buffer.byteLength(s, 'utf8')}\r\n\r\n` + s;

      // If we're currently under backpressure or already have queued messages,
      // enqueue the payload and return. It will be flushed on 'drain'.
      if (this.backpressureActive || this.sendQueue.length > 0) {
        this.sendQueue.push(payload);
        return;
      }

      const ok = this.output.write(payload);
      if (!ok) {
        // Writable signaled it's full — pause input and wait for drain.
        this.backpressureActive = true;
        try {
          // pause is idempotent
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          this.input.pause();
        } catch (e) {
          // best-effort
        }
        this.output.once('drain', this.onDrain);
      }
    } catch (e) {
      // best-effort
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    try {
      this.input.removeAllListeners('data');
      this.input.removeAllListeners('end');
      this.input.removeAllListeners('error');
      // Clean up any pending drain listener and queued messages.
      try {
        this.output.removeListener('drain', this.onDrain);
      } catch (e) {
        // ignore
      }
      this.sendQueue.length = 0;
      try {
        // resume input if paused
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.input.resume();
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // ignore
    }
  }
}
