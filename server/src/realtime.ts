import type { Request, Response } from 'express';
import { mcpEventBus } from './lib/mcp-event-bus.js';

// ---------------------------------------------------------------------------
// Workspace-scoped SSE client registry
// ---------------------------------------------------------------------------

/**
 * Map of workspaceId → set of active SSE response streams for that workspace.
 * Events are only delivered to clients subscribed to the matching workspace.
 */
const clientsByWorkspace = new Map<string, Set<Response>>();

function addClient(workspaceId: string, res: Response) {
  let set = clientsByWorkspace.get(workspaceId);
  if (!set) {
    set = new Set();
    clientsByWorkspace.set(workspaceId, set);
  }
  set.add(res);
}

function removeClient(workspaceId: string, res: Response) {
  const set = clientsByWorkspace.get(workspaceId);
  if (set) {
    set.delete(res);
    if (set.size === 0) {
      clientsByWorkspace.delete(workspaceId);
    }
  }
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
export function subscribeToEvents(req: Request, res: Response) {
  const workspaceId =
    typeof req.query.workspaceId === 'string' ? req.query.workspaceId.trim() : '';

  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId query parameter is required.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write(
    `data: ${JSON.stringify({ type: 'init', message: 'Connected to Gravity live stream', workspaceId })}\n\n`,
  );

  addClient(workspaceId, res);

  req.on('close', () => {
    removeClient(workspaceId, res);
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