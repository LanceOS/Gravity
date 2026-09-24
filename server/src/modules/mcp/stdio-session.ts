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
  // Nonstandard compatibility mode for older Gravity clients.
  framedOutput?: boolean;
  /** @deprecated Standard MCP output is already newline-delimited. */
  legacyOutput?: boolean;
  onStop?: () => void | Promise<void>;
};

// Default maximum allowed message size in bytes. Exported for reuse.
export const DEFAULT_MAX_MESSAGE_SIZE = 10 * 1024 * 1024;

/** Standard MCP newline framing with an input compatibility path for old framed clients. */
export class McpStdioSession {
  // Efficient chunk queue to avoid repeated Buffer.concat on each data event.
  private chunks: Buffer[] = [];
  private totalLength = 0;
  private running = false;
  private connectionTokenId: string | null = null;
  private connectionTokenHash: string | null = null;
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
  private onOutputError = () => {
    void this.stop();
  };
  private onOutputClose = () => {
    void this.stop();
  };
  private onInputClose = () => {
    void this.processingPromise.finally(() => this.stop());
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

    this.input.on('end', () => {
      // Finish already-read messages before shutting down the output.
      void this.processingPromise.finally(() => this.stop());
    });
    this.input.on('error', () => {
      void this.stop();
    });
    this.input.on('close', this.onInputClose);
    this.output.on('error', this.onOutputError);
    this.output.on('close', this.onOutputClose);
  }

  private processBuffer() {
    while (this.totalLength > 0) {
      const prefix = this.peekUpTo(Math.min(this.totalLength, 64 * 1024)).toString('utf8');
      const headerName = 'content-length:';
      const isFramed = prefix.toLowerCase().startsWith(headerName)
        || headerName.startsWith(prefix.toLowerCase());
      if (isFramed) {
        let headerEnd = prefix.indexOf('\r\n\r\n');
        let separatorLength = 4;
        if (headerEnd < 0) { headerEnd = prefix.indexOf('\n\n'); separatorLength = 2; }
        if (headerEnd < 0) {
          if (this.totalLength > 64 * 1024) {
            this.clearChunks();
            this.send(createMcpErrorResponse(null, ERR_MISSING_CONTENT_LENGTH, 'Invalid framing header'));
          }
          return;
        }
        const match = prefix.slice(0, headerEnd).match(/^Content-Length:\s*(\d+)\s*$/i);
        const length = match ? Number(match[1]) : NaN;
        if (!Number.isSafeInteger(length) || length < 0 || length > this.maxMessageSize) {
          this.clearChunks();
          this.send(createMcpErrorResponse(null, length > this.maxMessageSize ? ERR_CONTENT_LENGTH_TOO_LARGE : ERR_INVALID_CONTENT_LENGTH,
            length > this.maxMessageSize ? 'Content-Length too large' : 'Invalid Content-Length header'));
          return;
        }
        if (this.totalLength < headerEnd + separatorLength + length) return;
        this.consumeBytes(headerEnd + separatorLength);
        this.handleRawJson(this.readBytes(length).toString('utf8'));
        continue;
      }

      const newline = this.indexOfByte(10);
      if (newline < 0) {
        if (this.totalLength > this.maxMessageSize) {
          this.clearChunks();
          this.send(createMcpErrorResponse(null, ERR_MESSAGE_TOO_LARGE, 'Message too large'));
        }
        return;
      }
      if (newline > this.maxMessageSize) {
        this.consumeBytes(newline + 1);
        this.send(createMcpErrorResponse(null, ERR_MESSAGE_TOO_LARGE, 'Message too large'));
        continue;
      }
      const line = this.readBytes(newline).toString('utf8').replace(/\r$/, '');
      this.consumeBytes(1);
      if (line.trim()) this.handleRawJson(line);
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
      // Reauthentication must never retain a previous authenticated identity.
      if (params.token || params.workspaceId) {
        this.connectionTokenId = null;
        this.connectionTokenHash = null;
        this.options.workspaceId = undefined;
        this.options.actorUserId = undefined;
        this.options.tokenScopes = undefined;
      }
      const token = typeof params.token === 'string' ? params.token.trim() : '';
      const workspaceId = typeof params.workspaceId === 'string' ? params.workspaceId.trim() : '';

      if (token && workspaceId) {
        try {
          const { verifyAndConsumeToken } = await import('./connection.js');
          const tokenRow = await verifyAndConsumeToken(token, workspaceId, {});
          if (!tokenRow || tokenRow.singleUse) {
            this.send(createMcpErrorResponse(payload.id ?? null, -32001, 'Invalid or expired token.'));
            return;
          }
          // Defense in depth: a valid token only proves it was minted for this
          // workspace, not that its issuer still belongs to it. Re-check
          // membership so a token whose issuer lost access can no longer
          // establish a session with accessChecked short-circuiting later
          // request handling.
          const { isMcpWorkspaceMember } = await import('./access.js');
          const issuerIsMember = tokenRow.generatedBy
            ? await isMcpWorkspaceMember(workspaceId, tokenRow.generatedBy)
            : false;
          if (!issuerIsMember) {
            this.send(createMcpErrorResponse(payload.id ?? null, -32001, 'Unauthorized workspace access.'));
            return;
          }
          this.connectionTokenId = tokenRow.id;
          this.connectionTokenHash = tokenRow.tokenHash;
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
      if (this.connectionTokenId) {
        const { verifyConnectionTokenSession } = await import('./connection.js');
        const token = await verifyConnectionTokenSession(this.connectionTokenId, workspaceId, actorUserId, this.connectionTokenHash);
        if (!token) {
          this.send(createMcpErrorResponse(payload?.id ?? null, -32001, 'Invalid or expired token.'));
          return;
        }
        this.options.tokenScopes = token.scopes;
      }
      const resp = await handleMcpRequest(request, workspaceId, actorUserId, {
        accessChecked: false,
        sanitize: !!this.options.sanitize,
        tokenScopes: this.options.tokenScopes,
      });
      if (resp !== null) this.send(resp);
    } catch (err) {
      this.send(createMcpErrorResponse(payload?.id ?? null, -32603, err instanceof Error ? err.message : String(err)));
    }
  }

  send(msg: unknown) {
    if (!this.running) {
      return;
    }

    try {
      if ((this.output as any).destroyed) {
        return;
      }

      const s = JSON.stringify(msg);
      // Prepare payload
      const payload = this.options.framedOutput ? `Content-Length: ${Buffer.byteLength(s, 'utf8')}\r\n\r\n` + s : s + '\n';

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

  async stop() {
    if (!this.running) return;
    this.running = false;
    try {
      this.input.removeAllListeners('data');
      this.input.removeAllListeners('end');
      this.input.removeAllListeners('error');
      this.input.removeListener('close', this.onInputClose);
      // Clean up any pending drain listener and queued messages.
      try {
      this.output.removeListener('drain', this.onDrain);
        this.output.removeListener('error', this.onOutputError);
        this.output.removeListener('close', this.onOutputClose);
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
      await this.processingPromise.catch(() => {});
      await this.options.onStop?.();
      this.sendQueue.length = 0;
    } catch (e) {
      // ignore
    }
  }
}
