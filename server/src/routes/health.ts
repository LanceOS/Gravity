import { Router } from 'express';
import { env } from '../env.js';

export function createHealthRouter() {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'gravity-server',
      nodeEnv: env.nodeEnv,
      authBaseUrl: env.betterAuthBaseUrl,
    });
  });

  return router;
}