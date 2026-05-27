import cors from 'cors';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './modules/auth/auth.js';
import { env } from './env.js';
import { createApiRouter } from './routes/index.js';
import { createAuthCompatibilityRouter } from './modules/auth/routes.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    }),
  );

  app.get('/', (_req, res) => {
    res.json({
      name: 'gravity-server',
      status: 'ready',
    });
  });

  app.use('/api/auth', createAuthCompatibilityRouter());
  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', createApiRouter());

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}