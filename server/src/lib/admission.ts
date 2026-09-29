import type { RequestHandler } from 'express';
import { isServerInitialized, isServerShuttingDown } from './server-lifecycle.js';

export const requireInitializedServer: RequestHandler = (_req, res, next) => {
  if (!isServerInitialized() || isServerShuttingDown()) {
    res.setHeader('Retry-After', '1');
    res.status(503).json({ error: 'Service unavailable' });
    return;
  }
  next();
};
