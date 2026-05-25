import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { workspaceMembers } from '../db/schema.js';
import { resolveRequestActorUserId } from '../lib/request-auth.js';
import { handleMcpRequest } from './request-handler.js';
import { createMcpErrorResponse } from './responses.js';

type McpRouteRequest = {
  header: (name: string) => string | undefined;
  body?: {
    id?: string | number | null;
    params?: {
      workspaceId?: string;
    };
  };
};

type McpRouteResponse = {
  status: (code: number) => McpRouteResponse;
  json: (body: unknown) => void;
};

export class McpRouterFactory {
  create() {
    const router = Router();

    router.post('/mcp/sse', async (req: McpRouteRequest, res: McpRouteResponse) => {
      try {
        const actorUserId = await resolveRequestActorUserId(req);
        if (!actorUserId) {
          res.status(401).json({ error: 'Authentication required.' });
          return;
        }

        const headerWorkspaceId = req.header('x-workspace-id') || req.header('X-Workspace-Id');
        const bodyWorkspaceId =
          typeof req.body?.params?.workspaceId === 'string' && req.body.params.workspaceId.trim().length > 0
            ? req.body.params.workspaceId.trim()
            : undefined;
        const workspaceId = headerWorkspaceId || bodyWorkspaceId;
        if (!workspaceId) {
          res.status(400).json({ error: 'X-Workspace-Id header or params.workspaceId is required.' });
          return;
        }

        const membershipRows = await db
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorUserId)))
          .limit(1);

        if (membershipRows.length === 0) {
          res.status(403).json({ error: 'Unauthorized workspace access.' });
          return;
        }

        const response = await handleMcpRequest(req.body, workspaceId, actorUserId);
        res.json(response);
      } catch (error) {
        res.status(200).json(
          createMcpErrorResponse(
            req.body?.id ?? null,
            -32603,
            error instanceof Error ? error.message : 'Internal error handling MCP request',
          ),
        );
      }
    });

    return router;
  }
}

const defaultRouterFactory = new McpRouterFactory();

export function createMcpRouter() {
  return defaultRouterFactory.create();
}
