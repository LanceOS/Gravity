import { Router } from 'express';
import { createAiRouter } from '../modules/ai/routes.js';
import { createHealthRouter } from '../modules/health/routes.js';
import { createProjectsRouter } from '../modules/workspaces/projects-routes.js';
import { createSettingsRouter } from '../modules/settings/routes.js';
import { createTicketsRouter } from '../modules/tickets/routes.js';
import { createUsersRouter } from '../modules/users/routes.js';
import { createWorkspacesRouter } from '../modules/workspaces/routes.js';
import { createMcpRouter } from '../modules/mcp/index.js';
import { createWebhookRouter } from '../modules/webhooks/routes.js';
import { subscribeToEvents } from '../realtime.js';

export function createApiRouter() {
  const router = Router();

  router.use(createHealthRouter());
  router.use(createUsersRouter());
  router.use(createSettingsRouter());
  router.use(createWorkspacesRouter());
  router.use(createProjectsRouter());
  router.use(createTicketsRouter());
  router.use(createAiRouter());
  router.use(createMcpRouter());
  router.use(createWebhookRouter());
  router.get('/events/subscribe', subscribeToEvents);

  return router;
}