import { type Request, type Response, type NextFunction, Router } from 'express';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { handleMcpRequest, SUPPORTED_MCP_PROTOCOL_VERSIONS } from './request-handler.js';
import { McpWorkspaceAccessService } from './access.js';
import { createMcpErrorResponse } from './responses.js';
import { createRateLimiter } from '../../lib/rateLimit.js';
import { createRedisRateLimiter } from '../../lib/rateLimitRedis.js';
import { env } from '../../env.js';
import { recordFailedAttempt, isBlocked, resetAttempts } from '../../lib/authThrottle.js';
import { gravityOAuthProvider, isMcpOAuthEnabled, OAUTH_DISABLED_MESSAGE, oauthResourceUrl, oauthResourceMetadataUrl } from './oauth.js';
import { getRequestSourceIp } from '../../lib/request-ip.js';

export interface McpRouterDependencies {
  workspaceAccessService?: McpWorkspaceAccessService;
}

type TransportContext = { workspaceId: string; actorUserId: string; tokenScopes?: string[] };

function requestWorkspaceId(req: Request) {
  const header = req.header('x-workspace-id')?.trim();
  const body = typeof req.body?.params?.workspaceId === 'string' ? req.body.params.workspaceId.trim() : undefined;
  return (typeof req.params.workspaceId === 'string' ? req.params.workspaceId : undefined) || header || body;
}

/** Stateless Streamable HTTP with JSON responses and no server-initiated SSE. */
export class McpRouterFactory {
  private readonly workspaceAccessService: McpWorkspaceAccessService;

  constructor(dependencies: McpRouterDependencies = {}) {
    this.workspaceAccessService = dependencies.workspaceAccessService ?? new McpWorkspaceAccessService();
  }

  private async authenticate(req: Request, res: Response, next: NextFunction) {
    try {
      const origin = req.header('origin');
      const allowedOrigins = new Set([...env.trustedOrigins, ...env.corsOrigins, new URL(env.betterAuthBaseUrl).origin]);
      if (origin && !allowedOrigins.has(origin)) {
        res.status(403).json({ error: 'Origin not allowed.' });
        return;
      }
      const protocolVersion = req.header('mcp-protocol-version');
      if (protocolVersion && !SUPPORTED_MCP_PROTOCOL_VERSIONS.some((version) => version === protocolVersion)) {
        res.status(400).json({ error: 'Unsupported MCP protocol version.' });
        return;
      }
      if (!req.is('application/json')) {
        res.status(415).json({ error: 'Content-Type must be application/json.' });
        return;
      }
      if (!req.accepts('application/json')) {
        res.status(406).json({ error: 'Accept must include application/json.' });
        return;
      }
      res.set('Cache-Control', 'no-store');
      const workspaceId = requestWorkspaceId(req);
      if (!workspaceId) {
        res.status(400).json({ error: 'X-Workspace-Id header or params.workspaceId is required.' });
        return;
      }
      const oauthTransport = Boolean(req.params.workspaceId);
      if (oauthTransport && !isMcpOAuthEnabled()) {
        res.status(503).json({ error: OAUTH_DISABLED_MESSAGE });
        return;
      }
      if (oauthTransport) res.set('WWW-Authenticate', `Bearer resource_metadata="${oauthResourceMetadataUrl(workspaceId)}"`);
      let tokenScopes: string[] | undefined;
      const authHeader = req.header('authorization')?.trim() ?? '';
      const hasBearer = /^bearer(?:\s|$)/i.test(authHeader);
      const bearer = authHeader.match(/^bearer\s+(.+)$/i)?.[1]?.trim();
      // Explicit credentials determine the scope even when a browser also sends
      // a session cookie. Ambient session authority must not bypass a token.
      let actorUserId = hasBearer || oauthTransport ? null : await resolveRequestActorUserId(req);
      if (hasBearer) {
        if (!bearer) {
          res.status(401).json({ error: 'Invalid token.' });
          return;
        }
        const ipKey = `ip:${getRequestSourceIp(req) ?? req.ip}`;
        // Guessed workspace IDs must not let unauthenticated callers lock out its users.
        if (await isBlocked(ipKey)) {
          res.status(429).json({ error: 'Too many authentication attempts; try later.' });
          return;
        }
        try {
          const { verifyAndConsumeToken } = await import('./connection.js');
          const oauthToken = oauthTransport ? await gravityOAuthProvider.verifyAccessToken(bearer) : null;
          if (oauthToken && oauthToken.resource?.href !== oauthResourceUrl(workspaceId)) throw new Error('Invalid token audience.');
          const token = oauthToken ? { generatedBy: String(oauthToken.extra?.actorUserId ?? ''), scopes: oauthToken.scopes }
            : await verifyAndConsumeToken(bearer, workspaceId, { sourceIp: getRequestSourceIp(req) });
          if (!token) {
            await recordFailedAttempt(ipKey).catch(() => {});
            res.status(401).json({ error: 'Invalid or expired token.' });
            return;
          }
          await resetAttempts(ipKey).catch(() => {});
          actorUserId = token.generatedBy;
          tokenScopes = Array.isArray(token.scopes) ? token.scopes : [];
        } catch {
          res.status(401).json({ error: 'Invalid token.' });
          return;
        }
      }
      if (!actorUserId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      if (!await this.workspaceAccessService.hasWorkspaceAccess(workspaceId, actorUserId)) {
        res.status(403).json({ error: 'Unauthorized workspace access.' });
        return;
      }
      res.removeHeader('WWW-Authenticate');
      res.locals.mcpContext = { workspaceId, actorUserId, tokenScopes } satisfies TransportContext;
      next();
    } catch (error) {
      next(error);
    }
  }

  create() {
    const router = Router();
    const createLimiter = env.redisEnabled ? createRedisRateLimiter : createRateLimiter;
    const transportIpLimiter = createLimiter({ namespace: 'mcp.transport.ip', windowMs: 60_000, max: 300, keyFn: (req) => `ip:${getRequestSourceIp(req) ?? req.ip}` });
    const workspaceLimiter = createLimiter({ namespace: 'mcp.transport.workspace', windowMs: 60_000, max: 120, keyFn: (req) => `workspace:${requestWorkspaceId(req)}` });
    const paths = ['/mcp', '/mcp/sse', '/workspaces/:workspaceId/mcp'];
    router.get(paths, (_req, res) => { res.set('Allow', 'POST').status(405).end(); });
    router.delete(paths, (_req, res) => { res.set('Allow', 'POST').status(405).end(); });
    // Workspace rate accounting happens only after authentication and membership checks.
    router.post(paths, transportIpLimiter, this.authenticate.bind(this), workspaceLimiter, async (req, res) => {
      const { workspaceId, actorUserId, tokenScopes } = res.locals.mcpContext as TransportContext;
      try {
        const response = await handleMcpRequest(req.body, workspaceId, actorUserId, {
          accessChecked: true, sanitize: req.header('x-mcp-sanitize') === 'true', tokenScopes,
        });
        if (req.params.workspaceId && response && 'result' in response && response.result
          && 'tools' in response.result && Array.isArray(response.result.tools)) {
          res.json({ ...response, result: { ...response.result, tools: response.result.tools.map(tool => ({
            ...tool, securitySchemes: [{ type: 'oauth2', scopes: [`tools/call:${tool.name}`] }],
          })) } });
          return;
        }
        if (response === null) res.status(202).end();
        else res.json(response);
      } catch (error) {
        res.status(200).json(createMcpErrorResponse(req.body?.id ?? null, -32603,
          error instanceof Error ? error.message : 'Internal error handling MCP request'));
      }
    });
    return router;
  }
}

const defaultRouterFactory = new McpRouterFactory();
export function createMcpRouter() {
  return defaultRouterFactory.create();
}
