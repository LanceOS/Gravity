import type { Request, Response } from 'express';
import { mcpEventBus } from './lib/mcp-event-bus.js';
import { audit, securityAlert } from './lib/logger.js';
import { getRequestSourceIp } from './lib/request-ip.js';
import { resolveRequestActorUserId } from './modules/auth/utils/request-auth.js';
import { verifyAndConsumeToken } from './modules/mcp/connection.js';
import { isMcpWorkspaceMember } from './modules/mcp/access.js';
import { isServerShuttingDown } from './lib/server-lifecycle.js';

type SseAuthMethod = 'session' | 'token';

type SseConnectionRecord = {
  workspaceId: string;
  userId: string;
  sourceIp: string | null;
  tokenId: string | null;
  tokenAuth: boolean;
  authMethod: SseAuthMethod;
  connectedAt: Date;
  cleanup: () => void;
  backpressureTimer?: ReturnType<typeof setTimeout>;
};

export const MAX_CONCURRENT_SSE_CONNECTIONS_PER_USER = 5;
export const MAX_SSE_BUFFERED_BYTES = 64 * 1024;
export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
export const SSE_SHUTDOWN_GRACE_MS = 1_000;
export const SSE_DRAIN_TIMEOUT_MS = 5_000;

type SseQueryValue = string | string[] | undefined;

function auditRejectedConnection(data: {
  workspaceId: string;
  userId?: string;
  sourceIp: string | null;
  status: number;
  reason: string;
}): void {
  try {
    audit('sse.connection.rejected', data);
  } catch {
    // Logging failures must not interrupt the rejection response. Do not copy
    // the sink's error, which may contain sensitive configuration, into alerts.
    securityAlert('security.audit_log_failed', {
      failureReason: 'audit_sink_unavailable',
      failedAuditEvent: 'sse.connection.rejected',
      workspaceId: data.workspaceId,
    });
  }
}

// ---------------------------------------------------------------------------
// Workspace-scoped SSE client registry
// ---------------------------------------------------------------------------

/**
 * Map of workspaceId → set of active SSE response streams for that workspace.
 * Events are only delivered to clients subscribed to the matching workspace.
 */
const clientsByWorkspace = new Map<string, Set<Response>>();

/**
 * Active user-scoped SSE stream registry for concurrency checks.
 */
const clientsByUser = new Map<string, Set<Response>>();

/**
 * Active token-scoped SSE stream registry for revocation-driven disconnects.
 */
const clientsByToken = new Map<string, Set<Response>>();

/**
 * Per-response metadata for active streams.
 */
const sseConnectionMeta = new Map<Response, SseConnectionRecord>();

function addToSet<T>(target: Map<string, Set<T>>, key: string, value: T): void {
  const existing = target.get(key);
  if (existing) {
    existing.add(value);
    return;
  }
  target.set(key, new Set([value]));
}

function removeFromSet<T>(target: Map<string, Set<T>>, key: string, value: T): void {
  const existing = target.get(key);
  if (!existing) {
    return;
  }

  existing.delete(value);

  if (existing.size === 0) {
    target.delete(key);
  }
}

function getClientSetSizeByUserId(userId: string): number {
  return clientsByUser.get(userId)?.size ?? 0;
}

export function hasRoomForSseConnection(userId: string): boolean {
  return getClientSetSizeByUserId(userId) < MAX_CONCURRENT_SSE_CONNECTIONS_PER_USER;
}

export interface SseAuthContext {
  userId: string;
  tokenId: string | null;
  sourceIp: string | null;
  authMethod: SseAuthMethod;
}

function buildDisconnectReason(meta: SseConnectionRecord, reason: string) {
  return {
    workspaceId: meta.workspaceId,
    userId: meta.userId,
    tokenId: meta.tokenId,
    tokenAuth: meta.tokenAuth,
    authMethod: meta.authMethod,
    sourceIp: meta.sourceIp,
    connectedAt: meta.connectedAt.toISOString(),
    reason,
  };
}

export function addClient(
  workspaceId: string,
  res: Response,
  meta: { userId: string; sourceIp: string | null; tokenId: string | null; authMethod: SseAuthMethod },
): void {
  if (isServerShuttingDown()) {
    res.destroy();
    return;
  }
  let workspaceSet = clientsByWorkspace.get(workspaceId);
  if (!workspaceSet) {
    workspaceSet = new Set();
    clientsByWorkspace.set(workspaceId, workspaceSet);
  }

  const record: SseConnectionRecord = {
    workspaceId,
    userId: meta.userId,
    sourceIp: meta.sourceIp,
    tokenId: meta.tokenId,
    tokenAuth: meta.authMethod === 'token',
    authMethod: meta.authMethod,
    connectedAt: new Date(),
    cleanup: () => {},
  };

  workspaceSet.add(res);
  addToSet(clientsByUser, meta.userId, res);
  sseConnectionMeta.set(res, record);

  if (meta.tokenId) {
    addToSet(clientsByToken, meta.tokenId, res);
  }

  const onClose = () => removeConnection(res, 'request_closed');
  const onError = () => disconnectSseConnection(res, 'stream_error');
  const onDrain = () => {
    clearTimeout(record.backpressureTimer);
    record.backpressureTimer = undefined;
  };
  res.once('close', onClose);
  res.once('error', onError);
  res.on('drain', onDrain);
  const heartbeat = setInterval(() => writeSseFrame(res, ': heartbeat\n\n'), SSE_HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();
  record.cleanup = () => {
    clearInterval(heartbeat);
    clearTimeout(record.backpressureTimer);
    res.off('close', onClose);
    res.off('error', onError);
    res.off('drain', onDrain);
  };

  audit('sse.connection.opened', {
    workspaceId,
    userId: meta.userId,
    authMethod: meta.authMethod,
    tokenId: meta.tokenId,
    tokenAuth: record.tokenAuth,
    sourceIp: meta.sourceIp,
    maxUserConnections: MAX_CONCURRENT_SSE_CONNECTIONS_PER_USER,
    activeUserConnections: getClientSetSizeByUserId(meta.userId),
  });
}

function removeConnection(response: Response, reason: string): void {
  const meta = sseConnectionMeta.get(response);
  if (!meta) {
    return;
  }

  sseConnectionMeta.delete(response);
  meta.cleanup();
  removeFromSet(clientsByWorkspace, meta.workspaceId, response);
  removeFromSet(clientsByUser, meta.userId, response);

  if (meta.tokenId) {
    removeFromSet(clientsByToken, meta.tokenId, response);
  }

  try {
    audit('sse.connection.closed', buildDisconnectReason(meta, reason));
  } catch {
    securityAlert('security.audit_log_failed', {
      failureReason: 'audit_sink_unavailable', failedAuditEvent: 'sse.connection.closed',
      workspaceId: meta.workspaceId,
    });
  }
}

export function disconnectSseConnection(response: Response, reason: string): void {
  const meta = sseConnectionMeta.get(response);
  if (!meta) {
    return;
  }

  removeConnection(response, reason);
  // Destroy slow/broken streams instead of asking end() to flush a stalled socket.
  response.destroy();
}

/** No application queue: bound backpressure and let disconnected clients reconnect.
 * Include UTF-8 byte size and Node's pending output before accepting a frame.
 */
function writeSseFrame(response: Response, frame: string): void {
  const record = sseConnectionMeta.get(response);
  if (!record) return;
  if (response.destroyed || response.writableEnded) {
    disconnectSseConnection(response, 'stream_closed');
    return;
  }
  if (response.writableLength + Buffer.byteLength(frame) > MAX_SSE_BUFFERED_BYTES) {
    disconnectSseConnection(response, 'buffer_limit');
    return;
  }
  if (record.backpressureTimer) {
    disconnectSseConnection(response, 'slow_consumer');
    return;
  }
  try {
    if (!response.write(frame) && sseConnectionMeta.has(response)) {
      // A single larger frame may reach Node's high-water mark even for a fast
      // peer. Allow it to drain, but never enqueue another frame behind it.
      record.backpressureTimer = setTimeout(() => {
        disconnectSseConnection(response, 'slow_consumer');
      }, SSE_DRAIN_TIMEOUT_MS);
      record.backpressureTimer.unref();
    }
  } catch {
    disconnectSseConnection(response, 'stream_error');
  }
}

/** Keep the deadline until the transport closes, not merely the HTTP response. */
export async function closeSseConnections(): Promise<void> {
  await Promise.all(Array.from(sseConnectionMeta.keys(), response => new Promise<void>(resolve => {
    const socket = response.socket;
    removeConnection(response, 'server_shutdown');
    if (!socket || socket.destroyed) {
      response.destroy();
      resolve();
      return;
    }
    const onError = () => socket.destroy();
    const onFinish = () => socket.end();
    const timer = setTimeout(() => socket.destroy(), SSE_SHUTDOWN_GRACE_MS);
    timer.unref();
    const onClose = () => {
      clearTimeout(timer);
      response.off('error', onError);
      response.off('finish', onFinish);
      socket.off('error', onError);
      resolve();
    };
    socket.once('close', onClose);
    socket.on('error', onError);
    response.on('error', onError);
    // Response close/finish can precede socket closure on keep-alive streams.
    response.once('finish', onFinish);
    try { response.end(); } catch { socket.destroy(); }
  })));
}

export function disconnectSseConnectionsByToken(tokenId: string): number {
  const responses = Array.from(clientsByToken.get(tokenId) ?? []);
  let disconnected = 0;

  for (const response of responses) {
    const meta = sseConnectionMeta.get(response);
    if (!meta || meta.tokenId !== tokenId) {
      continue;
    }

    disconnected += 1;
    disconnectSseConnection(response, 'token_revoked');
  }

  return disconnected;
}

function firstQueryValue(value: SseQueryValue): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? '';
  }
  return '';
}

type SseAuthResult =
  | { ok: true; context: SseAuthContext }
  | { ok: false; status: number; error: string };

async function authenticateSseConnection(
  req: Request,
  workspaceId: string,
): Promise<SseAuthResult> {
  const sourceIp = getRequestSourceIp(req);
  const token = firstQueryValue(req.query.token as any);
  if (token) {
    const tokenRow = await verifyAndConsumeToken(token, workspaceId, { sourceIp });
    if (!tokenRow) {
      return { ok: false, status: 401, error: 'Invalid or expired token.' };
    }

    const isMember = await isMcpWorkspaceMember(workspaceId, tokenRow.generatedBy);
    if (!isMember) {
      return { ok: false, status: 403, error: 'Access denied: not a member of the workspace.' };
    }

    return {
      ok: true,
      context: {
        userId: tokenRow.generatedBy,
        tokenId: tokenRow.id,
        sourceIp,
        authMethod: 'token',
      },
    };
  }

  const actorUserId = await resolveRequestActorUserId(req);
  if (!actorUserId) {
    return { ok: false, status: 401, error: 'Authentication required.' };
  }

  const isMember = await isMcpWorkspaceMember(workspaceId, actorUserId);
  if (!isMember) {
    return { ok: false, status: 403, error: 'Access denied: not a member of the workspace.' };
  }

  return {
    ok: true,
    context: {
      userId: actorUserId,
      tokenId: null,
      sourceIp,
      authMethod: 'session',
    },
  };
}

// ---------------------------------------------------------------------------
// Wire the MCP event bus → workspace-scoped SSE broadcast
// ---------------------------------------------------------------------------

mcpEventBus.subscribeAll((event) => {
  broadcastToWorkspace(event.workspaceId, event.type, event);
});

// ---------------------------------------------------------------------------
// SSE subscription endpoint
// ---------------------------------------------------------------------------

/**
 * @description Attaches an SSE response stream to the given workspace, then
 * keeps it alive until the client disconnects.
 *
 * Expects `workspaceId` as a query-string parameter, e.g.:
 *   GET /api/v1/events/subscribe?workspaceId=w-abc-123
 *
 * @param req Express request (must contain `query.workspaceId`).
 * @param res Express response to use as the long-lived SSE stream.
 */
export async function subscribeToEvents(req: Request, res: Response) {
  if (isServerShuttingDown()) {
    res.status(503).json({ error: 'Server is shutting down.' });
    return;
  }
  const workspaceId =
    typeof req.query.workspaceId === 'string' ? req.query.workspaceId.trim() : '';

  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId query parameter is required.' });
    return;
  }

  const authAttempt = await authenticateSseConnection(req, workspaceId);
  // Authentication awaits database work; shutdown or peer closure may win that race.
  if (res.destroyed || req.destroyed) return;
  if (isServerShuttingDown()) {
    res.status(503).json({ error: 'Server is shutting down.' });
    return;
  }
  if (!authAttempt.ok) {
    // Never include the request URL, cookies, or query token in audit records.
    auditRejectedConnection({
      workspaceId,
      sourceIp: getRequestSourceIp(req),
      status: authAttempt.status,
      reason: authAttempt.status === 403 ? 'workspace_access_denied' : 'authentication_required_or_invalid',
    });
    res.status(authAttempt.status).json({ error: authAttempt.error });
    return;
  }

  if (!hasRoomForSseConnection(authAttempt.context.userId)) {
    auditRejectedConnection({
      workspaceId,
      userId: authAttempt.context.userId,
      sourceIp: authAttempt.context.sourceIp,
      status: 429,
      reason: 'connection_limit_reached',
    });
    res.status(429).json({ error: 'Too many concurrent SSE connections for this user.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  addClient(workspaceId, res, {
    userId: authAttempt.context.userId,
    sourceIp: authAttempt.context.sourceIp,
    tokenId: authAttempt.context.tokenId,
    authMethod: authAttempt.context.authMethod,
  });

  writeSseFrame(
    res,
    `data: ${JSON.stringify({ type: 'init', message: 'Connected to Gravity live stream', workspaceId })}\n\n`,
  );
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

// Oversized payloads become a constant-size cache invalidation, never a
// disconnect of otherwise healthy subscribers. No user data is copied here.
function encodeBroadcastFrame(payload: string): string {
  const frame = `data: ${payload}\n\n`;
  return Buffer.byteLength(frame) <= MAX_SSE_BUFFERED_BYTES
    ? frame
    : 'data: {"type":"resync-required","data":{}}\n\n';
}

/**
 * @description Broadcasts a typed SSE event to all clients subscribed to the
 * given workspace. No event leaks across workspace boundaries.
 * @param workspaceId Target workspace.
 * @param type Event type string.
 * @param data Arbitrary serialisable payload.
 */
export function broadcastToWorkspace(workspaceId: string, type: string, data: unknown) {
  const clients = clientsByWorkspace.get(workspaceId);
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({ type, data });
  const line = encodeBroadcastFrame(payload);

  for (const client of clients) {
    writeSseFrame(client, line);
  }
}

/**
 * @description Broadcasts an event to **all** connected clients across every
 * workspace. Use sparingly — prefer `broadcastToWorkspace` for mutation events.
 * Retained for backward compatibility with existing HTTP route callers.
 * @param type Event type string.
 * @param data Arbitrary serialisable payload.
 * @deprecated Pass a `workspaceId` and call `broadcastToWorkspace` instead.
 */
export function broadcastEvent(type: string, data: unknown) {
  const payload = JSON.stringify({ type, data });
  const line = encodeBroadcastFrame(payload);

  for (const clients of clientsByWorkspace.values()) {
    for (const client of clients) {
      writeSseFrame(client, line);
    }
  }
}

/**
 * @description Returns the total number of active SSE connections across all
 * workspaces. Useful for health checks and tests.
 */
export function activeConnectionCount(): number {
  let total = 0;
  for (const set of clientsByWorkspace.values()) {
    total += set.size;
  }
  return total;
}
