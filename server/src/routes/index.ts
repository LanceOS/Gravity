import { Router } from 'express';
import { createAiRouter } from '../modules/ai/routes.js';
import { createHealthRouter } from '../modules/health/routes.js';
import { createProjectsRouter } from '../modules/workspaces/projects-routes.js';
import { createSettingsRouter } from '../modules/settings/routes.js';
import { createTicketsRouter } from '../modules/tickets/routes.js';
import { createUsersRouter } from '../modules/users/routes.js';
import { createWorkspacesRouter } from '../modules/workspaces/routes.js';
import { createMcpRouter } from '../modules/mcp/index.js';
import { createNotesRouter } from '../modules/notes/routes.js';
import { createWebhookRouter } from '../modules/webhooks/routes.js';
import { createTeamsRouter } from '../modules/workspaces/teams-routes.js';
import { createChatsRouter } from '../modules/chats/routes.js';
import { csrfProtect } from '../lib/csrf.js';
import { subscribeToEvents } from '../realtime.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { createRedisRateLimiter } from '../lib/rateLimitRedis.js';
import { env } from '../env.js';
import { createOAuthConsentRouter } from '../modules/mcp/oauth.js';
import { getRequestSourceIp } from '../lib/request-ip.js';

export const SSE_EVENTS_IP_RATE_LIMIT_MAX = 30;
export const SSE_EVENTS_IP_RATE_LIMIT_WINDOW_MS = 60_000;

export function createApiRouter() {
  const router = Router();
  const createLimiter = env.redisEnabled ? createRedisRateLimiter : createRateLimiter;
  const eventsIpLimiter = createLimiter({
    namespace: 'events.subscribe.ip',
    windowMs: SSE_EVENTS_IP_RATE_LIMIT_WINDOW_MS,
    max: SSE_EVENTS_IP_RATE_LIMIT_MAX,
    keyFn: (req) => `ip:${getRequestSourceIp(req) ?? req.ip}`,
  });

  // The workspace OAuth transport requires a bearer token and never uses a
  // browser cookie. Let its first unauthenticated request reach the 401 OAuth
  // challenge instead of rejecting discovery for a missing Origin header.
  // Session-authenticated legacy MCP and every other API keep CSRF protection.
  const protectCsrf = csrfProtect();
  router.use((req, res, next) => {
    if (req.method === 'POST' && /^\/workspaces\/[^/]+\/mcp\/?$/.test(req.path)) return next();
    return protectCsrf(req, res, next);
  });
  // Handle the bearer-only challenge before workspace routers that also install
  // CSRF middleware for their browser-driven management endpoints.
  router.use(createMcpRouter());

  router.use(createHealthRouter());
  router.use(createUsersRouter());
  router.use(createSettingsRouter());
  router.use(createWorkspacesRouter());
  router.use(createTeamsRouter());
  router.use(createProjectsRouter());
  router.use(createTicketsRouter());
  router.use(createChatsRouter());
  router.use(createAiRouter());
  router.use(createOAuthConsentRouter());
  router.use(createNotesRouter());
  router.use(createWebhookRouter());
  router.get('/events/subscribe', eventsIpLimiter, subscribeToEvents);

  return router;
}
