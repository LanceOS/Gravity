import { and, eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { db } from '../../db/index.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { handleMcpRequest } from './request-handler.js';
import { isWorkspaceMember } from '../workspaces/services/membership.js';
import { createMcpErrorResponse } from './responses.js';

/**
 * @description Builds the HTTP MCP transport. Request authentication and
 * workspace guard failures stay HTTP-native here before control passes to the
 * JSON-RPC handler.
 */
export class McpRouterFactory {
  /**
   * @description Creates the Express router that serves the MCP HTTP endpoint.
   * @return The configured MCP router instance.
   */
  create() {
    const router = Router();

    router.post('/mcp/sse', async (req: Request, res: Response) => {
      try {
        // Transport-level auth and workspace validation use plain HTTP semantics.
        const actorUserId = await resolveRequestActorUserId(req);
        if (!actorUserId) {
          res.status(401).json({ error: 'Authentication required.' });
          return;
        }

        const headerWorkspaceId = (req.header('x-workspace-id') || req.header('X-Workspace-Id'))?.trim();
        const bodyWorkspaceId =
          typeof req.body?.params?.workspaceId === 'string' && req.body.params.workspaceId.trim().length > 0
            ? req.body.params.workspaceId.trim()
            : undefined;
        const workspaceId = headerWorkspaceId || bodyWorkspaceId;
        if (!workspaceId) {
          res.status(400).json({ error: 'X-Workspace-Id header or params.workspaceId is required.' });
          return;
        }

        const hasAccess = await isWorkspaceMember(workspaceId, actorUserId);

        if (!hasAccess) {
          res.status(403).json({ error: 'Unauthorized workspace access.' });
          return;
        }

        const response = await handleMcpRequest(req.body, workspaceId, actorUserId, {
          accessChecked: true,
          sanitize: req.header('x-mcp-sanitize') === 'true',
        });
        res.json(response);
      } catch (error) {
        // Once inside JSON-RPC handling, unexpected failures are returned as MCP errors.
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

/**
 * @description Creates the default HTTP router instance used by the API server.
 * @return The configured MCP router instance.
 */
export function createMcpRouter() {
  return defaultRouterFactory.create();
}
