import type { Request, Response } from 'express';
import { mcpEventBus } from './lib/mcp-event-bus.js';
import { audit } from './lib/logger.js';
import { getRequestSourceIp } from './lib/request-ip.js';
import { resolveRequestActorUserId } from './modules/auth/utils/request-auth.js';
import { verifyAndConsumeToken } from './modules/mcp/connection.js';
import { isWorkspaceMember } from './modules/workspaces/services/membership.js';

type SseAuthMethod = 'session' | 'token';

type SseConnectionRecord = {
  workspaceId: string;
  userId: string;
  sourceIp: string | null;
  tokenId: string | null;
  tokenAuth: boolean;
  authMethod: SseAuthMethod;
  connectedAt: Date;
};

export const MAX_CONCURRENT_SSE_CONNECTIONS_PER_USER = 5;

type SseQueryValue = string | string[] | undefined;

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
  };

  workspaceSet.add(res);
  addToSet(clientsByUser, meta.userId, res);
  sseConnectionMeta.set(res, record);

  if (meta.tokenId) {
    addToSet(clientsByToken, meta.tokenId, res);
  }

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
  removeFromSet(clientsByWorkspace, meta.workspaceId, response);
  removeFromSet(clientsByUser, meta.userId, response);

  if (meta.tokenId) {
    removeFromSet(clientsByToken, meta.tokenId, response);
  }

  audit('sse.connection.closed', buildDisconnectReason(meta, reason));
}

export function disconnectSseConnection(response: Response, reason: string): void {
  const meta = sseConnectionMeta.get(response);
  if (!meta) {
    return;
  }

  try {
    response.end();
  } finally {
    removeConnection(response, reason);
  }
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
  const sourceIp = getRequestSourceIp(req) ?? req.ip ?? null;
  const token = firstQueryValue(req.query.token);
  if (token) {
    const tokenRow = await verifyAndConsumeToken(token, workspaceId, { sourceIp });
    if (!tokenRow) {
      return { ok: false, status: 401, error: 'Invalid or expired token.' };
    }

    const isMember = await isWorkspaceMember(workspaceId, tokenRow.generatedBy);
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

  const isMember = await isWorkspaceMember(workspaceId, actorUserId);
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
  const workspaceId =
    typeof req.query.workspaceId === 'string' ? req.query.workspaceId.trim() : '';

  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId query parameter is required.' });
    return;
  }

  const authAttempt = await authenticateSseConnection(req, workspaceId);
  if (!authAttempt.ok) {
    res.status(authAttempt.status).json({ error: authAttempt.error });
    return;
  }

  if (!hasRoomForSseConnection(authAttempt.context.userId)) {
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

  res.write(
    `data: ${JSON.stringify({ type: 'init', message: 'Connected to Gravity live stream', workspaceId })}\n\n`,
  );

  req.on('close', () => {
    disconnectSseConnection(res, 'request_closed');
  });
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

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
  const line = `data: ${payload}\n\n`;

  for (const client of clients) {
    client.write(line);
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
  const line = `data: ${payload}\n\n`;

  for (const clients of clientsByWorkspace.values()) {
    for (const client of clients) {
      client.write(line);
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
