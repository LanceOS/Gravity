import { Router } from 'express';
import { getLocalNodeIdentity } from '../lib/node-identity.js';

export function createFederationRouter() {
  const router = Router();

  router.get('/federation/identity', async (_req, res) => {
    try {
      const identity = await getLocalNodeIdentity();
      if (!identity) {
        res.status(503).json({ error: 'Local node identity has not been initialized yet.' });
        return;
      }

      res.json({
        id: identity.id,
        displayName: identity.displayName,
        publicKey: identity.publicKey,
        algorithm: 'Ed25519',
        createdAt: identity.createdAt,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load local node identity.' });
    }
  });

  return router;
}