import { Router } from 'express';
import { isServerInitialized, isServerShuttingDown } from '../../lib/server-lifecycle.js';
import type { Readiness } from '../../lib/readiness.js';

export function createHealthRouter(check: () => Promise<Readiness> = async () => {
  if (!isServerInitialized() || isServerShuttingDown()) {
    return { status: 'unavailable', checks: { lifecycle: { required: true, status: 'unavailable' } } };
  }
  const { checkReadiness } = await import('../../lib/dependency-readiness.js');
  return checkReadiness();
}) {
  const router = Router();
  router.get('/health/live', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', service: 'gravity-server' });
  });
  // Keep the old endpoint as a readiness alias for existing monitoring.
  router.get(['/health', '/health/ready'], async (_req, res) => {
    const result = await check();
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status === 'unavailable' ? 503 : 200).json(result);
  });
  return router;
}
