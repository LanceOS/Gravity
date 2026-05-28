import { and, eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { db } from '../../db/index.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { handleMcpRequest } from './request-handler.js';
import { isWorkspaceMember } from '../workspaces/services/membership.js';
import { createMcpErrorResponse } from './responses.js';
import { createRateLimiter } from '../../lib/rateLimit.js';
import { createRedisRateLimiter } from '../../lib/rateLimitRedis.js';
import { env } from '../../env.js';
import { recordFailedAttempt, isBlocked, resetAttempts } from '../../lib/authThrottle.js';
import { getRequestSourceIp } from '../../lib/request-ip.js';

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

    const createLimiter = env.redisEnabled ? createRedisRateLimiter : createRateLimiter;

    const workspaceTransportLimiter = createLimiter({
      windowMs: 60_000,
      max: 120,
      keyFn: async (req) => {
        const headerWorkspaceId = (req.header('x-workspace-id') || req.header('X-Workspace-Id'))?.trim();
        const bodyWorkspaceId =
          typeof req.body?.params?.workspaceId === 'string' && req.body.params.workspaceId.trim().length > 0
            ? req.body.params.workspaceId.trim()
            : undefined;
        const workspaceId = headerWorkspaceId || bodyWorkspaceId;
        const clientIp = getRequestSourceIp(req) ?? req.ip;
        return workspaceId ? `workspace:${workspaceId}` : `ip:${clientIp}`;
      },
    });

    const transportIpLimiter = createLimiter({ windowMs: 60_000, max: 300, keyFn: (req) => `ip:${getRequestSourceIp(req) ?? req.ip}` });

    router.post('/mcp/sse', workspaceTransportLimiter, transportIpLimiter, async (req: Request, res: Response) => {
      try {
        // Transport-level auth and workspace validation use plain HTTP semantics.
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

        // First try normal session-based authentication.
        let actorUserId = await resolveRequestActorUserId(req);
        // Prepare optional token scopes placeholder for token-authenticated transports.
        let tokenScopes: string[] | undefined = undefined;
        // (debug logs removed)
        let accessChecked = false;

        // When tests enable ALLOW_DEV_AUTH_BYPASS the bearer token in the
        // `Authorization` header may be interpreted as a user id by the
        // test helper. If the resolved actorUserId exactly matches the raw
        // bearer token we detected, treat it as a token instead so the
        // explicit token verification path below runs.
        const rawAuthHeader = (req.header('authorization') || req.header('Authorization') || '').trim();
        if (actorUserId && rawAuthHeader.toLowerCase().startsWith('bearer ')) {
          const possibleToken = rawAuthHeader.slice('bearer '.length).trim();
          if (possibleToken && actorUserId === possibleToken) {
            actorUserId = null;
          }
        }

        if (actorUserId) {
          const hasAccess = await isWorkspaceMember(workspaceId, actorUserId);
          if (!hasAccess) {
            res.status(403).json({ error: 'Unauthorized workspace access.' });
            return;
          }
          accessChecked = true;
        } else {
          // Fallback to bearer token auth for external MCP clients. Token must be bound to workspace.
          const authHeader = (req.header('authorization') || req.header('Authorization') || '').trim();
          if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice('Bearer '.length).trim();
            if (token) {
                // Throttle repeated failed verification attempts by IP and workspace
                const ipKey = `ip:${getRequestSourceIp(req) ?? req.ip}`;
                const headerWorkspaceId = (req.header('x-workspace-id') || req.header('X-Workspace-Id'))?.trim();
                const bodyWorkspaceId =
                  typeof req.body?.params?.workspaceId === 'string' && req.body.params.workspaceId.trim().length > 0
                    ? req.body.params.workspaceId.trim()
                    : undefined;
                const wsKey = headerWorkspaceId || bodyWorkspaceId ? `workspace:${headerWorkspaceId || bodyWorkspaceId}` : null;
                if (isBlocked(ipKey) || (wsKey && isBlocked(wsKey))) {
                  res.status(429).json({ error: 'Too many authentication attempts; try later.' });
                  return;
                }
              try {
                const { verifyAndConsumeToken } = await import('./connection.js');
                const sourceIp = getRequestSourceIp(req);
                const tokenRow = await verifyAndConsumeToken(token, workspaceId, { sourceIp });
                if (!tokenRow) {
                    // record failed attempt counters
                    try {
                      recordFailedAttempt(ipKey);
                      if (wsKey) recordFailedAttempt(wsKey);
                    } catch (e) {
                      // best-effort
                    }
                    res.status(401).json({ error: 'Invalid or expired token.' });
                    return;
                }
                  // reset any failure counters on successful verification
                  try {
                    resetAttempts(ipKey);
                    if (wsKey) resetAttempts(wsKey);
                  } catch (e) {
                    // best-effort
                  }

                  tokenScopes = Array.isArray(tokenRow.scopes) ? tokenRow.scopes : [];
                  actorUserId = tokenRow.generatedBy;
                  accessChecked = true;
              } catch (err) {
                res.status(401).json({ error: 'Invalid token.' });
                return;
              }
            }
          }

          if (!accessChecked) {
            res.status(401).json({ error: 'Authentication required.' });
            return;
          }
        }

        // tokenScopes propagated to handler (no debug log here)

        const response = await handleMcpRequest(req.body, workspaceId, actorUserId, {
          accessChecked: true,
          sanitize: req.header('x-mcp-sanitize') === 'true',
          tokenScopes,
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
