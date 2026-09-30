import type { Readable, Writable } from 'node:stream';
import { getMcpStdioHandshakeConfig } from './stdio-config.js';
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
  // Also requires administrator opt-in via MCP_STDIO_ALLOW_HANDSHAKE=true.
  allowHandshake?: boolean;
  // Maximum allowed message size in bytes. Defaults to 10 MiB.
  maxMessageSize?: number;
  // Nonstandard compatibility mode for older Gravity clients.
  framedOutput?: boolean;
  /** @deprecated Standard MCP output is already newline-delimited. */
  legacyOutput?: boolean;
  // Includes the active request. Limits also apply to notifications.
  maxPendingRequests?: number;
  maxPendingBytes?: number;
  requestTimeoutMs?: number;
  // Bounds EOF completion and stalled output, independently of request execution.
  drainTimeoutMs?: number;
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
  private readonly handshakeConfig;
  // The serialized request queue makes this transport-local counter race-free.
  private handshakeFailures = 0;
  private handshakeWindowStart = 0;
  private readonly limits;
  private pending: { request: unknown; bytes: number }[] = [];
  private pendingBytes = 0;
  private active = false;
  private ended = false;
  private stopped = false;
  private stopPromise?: Promise<void>;
  private requestTimer?: ReturnType<typeof setTimeout>;
  private drainTimer?: ReturnType<typeof setTimeout>;
  private eofTimer?: ReturnType<typeof setTimeout>;
  private sendQueue: string[] = [];
  private sendQueueBytes = 0;
  private writesInFlight = 0;
  private writeBytesInFlight = 0;
  private backpressureActive = false;

  // Node emits drain before the final write callback updates our accounting.
  private onDrain = () => queueMicrotask(() => {
    if (!this.running) return;
    this.backpressureActive = false;
    while (this.running && this.sendQueue.length > 0) {
      const next = this.sendQueue.shift()!;
      this.sendQueueBytes -= Buffer.byteLength(next);
      if (!this.write(next)) return;
    }
    this.pump();
    if (this.running && !this.ended && !this.backpressureActive) this.input.resume();
    this.finishIfIdle();
  });
  private onStreamError = () => { void this.stop(); };
  private onOutputClose = () => {
    void this.stop();
    this.output.removeListener('error', this.onStreamError);
    this.output.removeListener('close', this.onOutputClose);
  };
  private onInputClose = () => {
    // A normal EOF may be followed by close while accepted work is draining.
    if (!this.ended) void this.stop();
    this.input.removeListener('error', this.onStreamError);
    this.input.removeListener('close', this.onInputClose);
  };
  private onInputEnd = () => {
    if (!this.running || this.ended) return;
    this.ended = true;
    this.clearChunks();
    this.eofTimer = setTimeout(() => { void this.stop(); }, this.limits.drainTimeoutMs);
    this.finishIfIdle();
  };
  private onData = (chunk: Buffer | string) => {
    if (!this.running || this.ended) return;
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    // Bound raw buffering as well as decoded requests, including coalesced frames.
    if (this.totalLength + buf.length > this.maxMessageSize + 64 * 1024) {
      void this.stop();
      return;
    }
    this.appendChunk(buf);
    try {
      this.processBuffer();
    } catch {
      void this.stop();
    }
  };

  constructor(private input: Readable, private output: Writable, private options: McpSessionOptions = {}) {
    this.maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
    this.limits = {
      maxPendingRequests: options.maxPendingRequests ?? 128,
      maxPendingBytes: options.maxPendingBytes ?? 16 * 1024 * 1024,
      requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
      drainTimeoutMs: options.drainTimeoutMs ?? 30_000,
    };
    for (const [name, value] of Object.entries({ maxMessageSize: this.maxMessageSize, ...this.limits })) {
      if (!Number.isSafeInteger(value) || value <= 0 ||
          (name.endsWith('TimeoutMs') && value > 2_147_483_647)) {
        throw new Error(`${name} must be a positive safe integer within the supported range`);
      }
    }
    this.handshakeConfig = getMcpStdioHandshakeConfig();
  }

  start() {
    if (this.running || this.stopped) return;
    this.running = true;
    this.input.on('data', this.onData);
    this.input.on('end', this.onInputEnd);
    this.input.on('error', this.onStreamError);
    this.input.on('close', this.onInputClose);
    this.output.on('error', this.onStreamError);
    this.output.on('close', this.onOutputClose);
    this.output.on('finish', this.onStreamError);
    if (this.output.destroyed || this.output.writableEnded || (this.input.destroyed && !this.input.readableEnded)) {
      void this.stop();
    } else if (this.input.readableEnded) {
      this.onInputEnd();
    }
  }

  private finishIfIdle() {
    if (this.ended && !this.active && !this.pending.length && !this.backpressureActive && !this.writesInFlight) void this.stop();
  }

  private pump() {
    if (!this.running || this.active || this.backpressureActive) return;
    const next = this.pending.shift();
    if (!next) { this.finishIfIdle(); return; }
    this.active = true;
    // A deadline retires the entire session. Never start another handler beside
    // a timed-out operation that may still be running in a dependency.
    this.requestTimer = setTimeout(() => { void this.stop(); }, this.limits.requestTimeoutMs);
    void this.delegateRequest(next.request).catch(() => {}).finally(() => {
      if (!this.running) return;
      clearTimeout(this.requestTimer);
      this.active = false;
      this.pendingBytes -= next.bytes;
      this.pump();
    });
  }

  private processBuffer() {
    while (this.running && this.totalLength > 0) {
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

    const bytes = Buffer.byteLength(raw);
    if (this.pending.length + Number(this.active) >= this.limits.maxPendingRequests ||
        this.pendingBytes + bytes > this.limits.maxPendingBytes) {
      // Do not generate one error per frame: a flood must not become an output flood.
      void this.stop();
      return;
    }
    this.pending.push({ request, bytes });
    this.pendingBytes += bytes;
    this.pump();
  }

  private async delegateRequest(request: unknown) {
    if (!this.running) return;
    const payload = request as any;

    // Optional handshake flow for dynamic token-based auth.
    if (payload?.method === 'stdio/handshake') {
      if (!this.options.allowHandshake || !this.handshakeConfig.enabled) {
        this.send(createMcpErrorResponse(payload.id ?? null, -32601, 'Stdio handshake is disabled.'));
        return;
      }
      const validId = typeof payload.id === 'string'
        || (typeof payload.id === 'number' && Number.isFinite(payload.id));
      const id = validId ? payload.id : null;
      const validParams = payload.params === undefined
        || (payload.params !== null && typeof payload.params === 'object' && !Array.isArray(payload.params));
      const validRequest = payload.jsonrpc === '2.0' && validId && validParams;
      const params = validParams ? payload.params ?? {} : {};
      // Reauthentication must never retain a previous authenticated identity.
      if (!validRequest || 'token' in params || 'workspaceId' in params) {
        this.connectionTokenId = null;
        this.connectionTokenHash = null;
        this.options.workspaceId = undefined;
        this.options.actorUserId = undefined;
        this.options.tokenScopes = undefined;
      }

      if (Date.now() - this.handshakeWindowStart >= this.handshakeConfig.windowMs) {
        this.handshakeFailures = 0;
      }
      if (this.handshakeFailures >= this.handshakeConfig.maxAttempts) {
        this.send(createMcpErrorResponse(id, -32029, 'Too many failed handshake attempts. Try again later.'));
        return;
      }
      if (!validRequest) {
        this.recordHandshakeFailure();
        this.send(createMcpErrorResponse(id, -32600, 'Handshake requires a valid JSON-RPC request with an id and object params.'));
        return;
      }
      const token = typeof params.token === 'string' ? params.token.trim() : '';
      const workspaceId = typeof params.workspaceId === 'string' ? params.workspaceId.trim() : '';

      if (token && workspaceId) {
        try {
          const { verifyAndConsumeToken } = await import('./connection.js');
          if (!this.running) return;
          const tokenRow = await verifyAndConsumeToken(token, workspaceId, { allowSingleUse: false });
          if (!this.running) return;
          if (!tokenRow || tokenRow.singleUse) {
            this.recordHandshakeFailure();
            this.send(createMcpErrorResponse(payload.id ?? null, -32001, 'Invalid or expired token.'));
            return;
          }
          // Defense in depth: a valid token only proves it was minted for this
          // workspace, not that its issuer still belongs to it. Re-check
          // membership so a token whose issuer lost access can no longer
          // establish a session with accessChecked short-circuiting later
          // request handling.
          const { isMcpWorkspaceMember } = await import('./access.js');
          if (!this.running) return;
          const issuerIsMember = tokenRow.generatedBy
            ? await isMcpWorkspaceMember(workspaceId, tokenRow.generatedBy)
            : false;
          if (!this.running) return;
          if (!issuerIsMember) {
            this.recordHandshakeFailure();
            this.send(createMcpErrorResponse(payload.id ?? null, -32001, 'Unauthorized workspace access.'));
            return;
          }
          this.handshakeFailures = 0;
          this.connectionTokenId = tokenRow.id;
          this.connectionTokenHash = tokenRow.tokenHash;
          this.options.workspaceId = workspaceId;
          this.options.actorUserId = tokenRow.generatedBy;
          this.options.tokenScopes = Array.isArray(tokenRow.scopes) ? tokenRow.scopes : [];
          this.send({ jsonrpc: '2.0', id: payload.id ?? null, result: { ok: true } });
          return;
        } catch (err) {
          if (!this.running) return;
          this.recordHandshakeFailure();
          this.send(createMcpErrorResponse(payload.id ?? null, -32603, 'Handshake failed.'));
          return;
        }
      }

      if (!this.options.workspaceId || !this.options.actorUserId) {
        this.recordHandshakeFailure();
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
        if (!this.running) return;
        const token = await verifyConnectionTokenSession(this.connectionTokenId, workspaceId, actorUserId, this.connectionTokenHash);
        if (!this.running) return;
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

  private recordHandshakeFailure() {
    if (this.handshakeFailures === 0) this.handshakeWindowStart = Date.now();
    this.handshakeFailures += 1;
  }

  private write(payload: string): boolean {
    try {
      if (this.output.destroyed || this.output.writableEnded) {
        void this.stop();
        return false;
      }
      if (this.writesInFlight++ === 0) {
        this.drainTimer = setTimeout(() => { void this.stop(); }, this.limits.drainTimeoutMs);
      }
      const bytes = Buffer.byteLength(payload);
      this.writeBytesInFlight += bytes;
      const accepted = this.output.write(payload, error => {
        this.writesInFlight--;
        this.writeBytesInFlight -= bytes;
        if (!this.running) return;
        if (error) { void this.stop(); return; }
        if (!this.writesInFlight) clearTimeout(this.drainTimer);
        this.finishIfIdle();
      });
      if (!accepted && this.running) {
        this.backpressureActive = true;
        this.input.pause();
        this.output.once('drain', this.onDrain);
        return false;
      }
      return true;
    } catch {
      void this.stop();
      return false;
    }
  }

  send(msg: unknown) {
    if (!this.running) return;
    try {
      const s = JSON.stringify(msg);
      const payload = this.options.framedOutput ? `Content-Length: ${Buffer.byteLength(s, 'utf8')}\r\n\r\n` + s : s + '\n';
      const bytes = Buffer.byteLength(payload);
      // Covers parser errors and callers of send(), not only request responses.
      if (bytes + this.sendQueueBytes + this.writeBytesInFlight > this.limits.maxPendingBytes ||
          this.sendQueue.length + this.writesInFlight >= this.limits.maxPendingRequests) {
        void this.stop();
        return;
      }
      if (this.backpressureActive) {
        this.sendQueue.push(payload);
        this.sendQueueBytes += bytes;
        return;
      }
      this.write(payload);
    } catch {
      void this.stop();
    }
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (!this.running) return Promise.resolve();
    this.running = false;
    this.stopped = true;
    clearTimeout(this.requestTimer);
    clearTimeout(this.drainTimer);
    clearTimeout(this.eofTimer);
    this.input.removeListener('data', this.onData);
    this.input.removeListener('end', this.onInputEnd);
    this.output.removeListener('drain', this.onDrain);
    this.output.removeListener('finish', this.onStreamError);
    // An outstanding write can emit an asynchronous error after cancellation.
    // Keep error guards until each stream closes; close removes those guards.
    if (this.input.closed) {
      this.input.removeListener('error', this.onStreamError);
      this.input.removeListener('close', this.onInputClose);
    }
    if (this.output.closed) {
      this.output.removeListener('error', this.onStreamError);
      this.output.removeListener('close', this.onOutputClose);
    }
    this.input.pause();
    this.clearChunks();
    this.pending.length = 0;
    this.pendingBytes = 0;
    this.sendQueue.length = 0;
    this.sendQueueBytes = 0;
    this.backpressureActive = false;
    // Cancellation is terminal and does not await an uncooperative handler.
    // A handler already inside a tool may still finish; send() suppresses its result.
    this.stopPromise = Promise.resolve().then(() => this.options.onStop?.()).catch(() => {});
    return this.stopPromise;
  }
}
