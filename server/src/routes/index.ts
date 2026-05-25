import { Router } from 'express';
import { createAiRouter } from './ai.js';
import { createFederationRouter } from './federation.js';
import { createHealthRouter } from './health.js';
import { createProjectsRouter } from './projects.js';
import { createSettingsRouter } from './settings.js';
import { createTicketsRouter } from './tickets.js';
import { createUsersRouter } from './users.js';
import { createWorkspacesRouter } from './workspaces.js';
import { createMcpRouter } from '../mcp/index.js';
import { createWebhookRouter } from '../webhooks.js';
import { subscribeToEvents } from '../realtime.js';

export function createApiRouter() {
  const router = Router();

  router.use(createHealthRouter());
  router.use(createFederationRouter());
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