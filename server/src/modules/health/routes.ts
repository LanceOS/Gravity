import { Router } from 'express';
import { env } from '../../env.js';
import { isServerShuttingDown } from '../../lib/server-lifecycle.js';

export function createHealthRouter() {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(isServerShuttingDown() ? 503 : 200).json({
      status: isServerShuttingDown() ? 'shutting_down' : 'ok',
      service: 'gravity-server',
      nodeEnv: env.nodeEnv,
      authBaseUrl: env.betterAuthBaseUrl,
    });
  });

  return router;
}
