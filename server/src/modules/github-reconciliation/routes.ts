import { applyReconciliation } from './apply.js';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { projects, tickets, ticketPullRequests } from '../../db/schema.js';
import { audit } from '../../lib/logger.js';
import { createRateLimiter } from '../../lib/rateLimit.js';
import { createRedisRateLimiter } from '../../lib/rateLimitRedis.js';
import { env } from '../../env.js';
import { authorizeProjectOwnerOrWorkspaceAdminAccess } from '../workspaces/services/membership.js';
import { buildCandidates, digest, signPlan } from './preview.js';
import { credentialSchema, fetchPullRequests, ReconciliationError, repositoryName, scanSchema } from './github.js';

const applySchema = z.object({
  previewToken: z.string().min(1).max(750_000),
  credential: credentialSchema,
  selections: z.array(z.object({ candidateId: z.string().min(1).max(255), reviewed: z.boolean().default(false) }).strict()).min(1).max(100),
}).strict();

const previewSchema = scanSchema.extend({ credential: credentialSchema }).strict();

export function createGithubReconciliationRouter() {
  const router = Router();
  const limit = (env.redisEnabled ? createRedisRateLimiter : createRateLimiter)({
    namespace: 'github.reconciliation', failurePolicy: 'closed', windowMs: 60_000, max: 10,
  });
  router.post('/projects/:projectId/github-reconciliation/preview', limit, async (req, res) => {
    try {
      const auth = await authorizeProjectOwnerOrWorkspaceAdminAccess(req, String(req.params.projectId));
      if (!auth.allowed) { res.status(auth.status).json({ error: auth.error }); return; }
      const input = previewSchema.parse(req.body ?? {});
      const [project] = await db.select().from(projects).where(eq(projects.id, auth.projectId)).limit(1);
      const repo = repositoryName(project?.githubRepoUrl ?? '');
      const scan = { startPage: input.startPage, maxPages: input.maxPages };
      const result = await fetchPullRequests(repo, scan, input.credential);
      const rows = await db.select({ id: tickets.id, projectId: tickets.projectId, key: tickets.key, title: tickets.title, branchName: tickets.branchName, status: tickets.status, prStatus: tickets.prStatus, prUrl: tickets.prUrl, updatedAt: tickets.updatedAt }).from(tickets).where(eq(tickets.projectId, auth.projectId)).limit(5001);
      if (rows.length > 5000) throw new ReconciliationError('This project exceeds the 5,000-ticket reconciliation limit.', 422);
      const tracked = await db.select({ ticketId: ticketPullRequests.ticketId, prUrl: ticketPullRequests.prUrl, status: ticketPullRequests.status })
        .from(ticketPullRequests).innerJoin(tickets, eq(tickets.id, ticketPullRequests.ticketId))
        .where(and(eq(tickets.projectId, auth.projectId), eq(ticketPullRequests.status, 'open'))).limit(5001);
      if (tracked.length > 5000) throw new ReconciliationError('This project exceeds the 5,000 tracked-open-PR reconciliation limit.', 422);
      const candidates = buildCandidates(rows, result.pulls, result.incomplete, tracked);
      const expiresAt = Date.now() + 15 * 60_000;
      const previewToken = signPlan({ version: 1, actorId: auth.userId, projectId: auth.projectId, repo,
        expiresAt, scan, pullsDigest: digest([result.pulls, result.incomplete, result.nextPage]), candidates });
      if (previewToken.length > 750_000) throw new ReconciliationError('Preview is too large. Reduce the page count.', 422);
      audit('github.reconciliation.preview', { projectId: auth.projectId, actorUserId: auth.userId,
        repository: repo, candidates: candidates.length, incomplete: result.incomplete, ...scan });
      res.json({ previewToken, expiresAt, repository: repo, candidates, scan,
        pagesFetched: result.pagesFetched, pullCount: result.pulls.length, incomplete: result.incomplete, nextPage: result.nextPage });
    } catch (error) {
      if (error instanceof z.ZodError) { res.status(400).json({ error: 'Invalid scan parameters or credential. Use pages 1–1000, at most 5 pages, and a fine-grained read-only token.' }); return; }
      res.status(error instanceof ReconciliationError ? error.status : 500)
        .json({ error: error instanceof ReconciliationError ? error.message : 'Reconciliation preview failed.' });
    }
  });
  router.post('/projects/:projectId/github-reconciliation/apply', limit, async (req, res) => {
    try {
      const auth = await authorizeProjectOwnerOrWorkspaceAdminAccess(req, String(req.params.projectId));
      if (!auth.allowed) { res.status(auth.status).json({ error: auth.error }); return; }
      const input = applySchema.parse(req.body);
      res.json(await applyReconciliation(auth.projectId, auth.userId, input.previewToken, input.selections, input.credential));
    } catch (error) {
      if (error instanceof z.ZodError) { res.status(400).json({ error: 'Select 1–100 preview matches and provide a valid preview and read-only credential.' }); return; }
      res.status(error instanceof ReconciliationError ? error.status : 500)
        .json({ error: error instanceof ReconciliationError ? error.message : 'Reconciliation apply failed.' });
    }
  });
  return router;
}
