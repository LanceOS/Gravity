import { allowLocalWebhookBypass } from '../../lib/local-webhook-bypass.js';
import { getRequestSourceIp } from '../../lib/request-ip.js';
import { Router } from 'express';
import { env } from '../../env.js';
import { verifyGitHubWebhookSignature } from '../../lib/webhookSignature.js';
import { broadcastToWorkspace } from '../../realtime.js';
import { getTicketById } from '../tickets/services/tickets.js';
import { GITHUB_AUTOMATION_ACTOR, normalizeGitHubRepositoryUrl, normalizeGitHubPullRequestUrl, processPullRequestEvent, SUPPORTED_PR_ACTIONS } from './processPullRequest.js';

// ── Finding #3: Simple per-IP rate limiter ────────────────────────────────────
// Tracks request timestamps per IP. No external dependency required.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60;  // 60 deliveries/min is well above any realistic GitHub burst
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitMap.get(ip) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

export function createWebhookRouter() {
  const router = Router();

  router.post('/webhooks/github', async (req, res) => {
    // ── Finding #3: Per-IP rate limiting ─────────────────────────────────────
    const clientIp = String(getRequestSourceIp(req) ?? 'unknown');
    if (isRateLimited(clientIp)) {
      res.status(429).json({ error: 'Too many requests.' });
      return;
    }

    // ── Finding #1: HMAC-SHA256 signature verification ────────────────────────
    // `express.raw()` in app.ts runs before `express.json()` for this route,
    // so req.body is a Buffer containing the original bytes.
    const rawBody = req.body as Buffer;
    const signatureHeader = req.header('x-hub-signature-256');

    if (env.githubWebhookSecret) {
      if (!verifyGitHubWebhookSignature(env.githubWebhookSecret, rawBody, signatureHeader)) {
        res.status(401).json({ error: 'Invalid webhook signature.' });
        return;
      }
    } else if (!allowLocalWebhookBypass(env.allowUnsignedLocalWebhooks, env.nodeEnv, req.socket.remoteAddress,
      Object.keys(req.headers).some(name => name === 'forwarded' || name.startsWith('x-forwarded-') || name === 'x-real-ip'))) {
      // Default to signed deliveries in every environment.
      res.status(503).json({ error: 'Webhook secret not configured.' });
      return;
    }

    // Parse the raw buffer into JSON now that the signature is verified.
    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      res.status(400).json({ error: 'Invalid JSON payload.' });
      return;
    }

    // ── Event type guard ──────────────────────────────────────────────────────
    const event = req.header('x-github-event');
    if (event !== 'pull_request') {
      res.json({ success: true });
      return;
    }

    const action = payload?.action;
    if (!SUPPORTED_PR_ACTIONS.has(action)) {
      res.json({ success: true });
      return;
    }
    const pr = payload?.pull_request;
    const deliveryId = req.header('x-github-delivery');
    const repoUrl = pr?.base?.repo?.html_url ?? payload?.repository?.html_url;
    const updatedAt = typeof pr?.updated_at === 'string' ? new Date(pr.updated_at) : new Date(NaN);
    if (!pr || !deliveryId || deliveryId.length > 255 || typeof repoUrl !== 'string'
      || !normalizeGitHubRepositoryUrl(repoUrl)
      || !Number.isSafeInteger(pr.number) || pr.number <= 0
      || typeof pr.html_url !== 'string'
      || normalizeGitHubPullRequestUrl(pr.html_url) !== `${normalizeGitHubRepositoryUrl(repoUrl)}/pull/${pr.number}` || !Number.isFinite(updatedAt.getTime())
      || (action === 'closed' && typeof pr.merged !== 'boolean')) {
      res.status(400).json({ error: 'Invalid pull request event, delivery ID, or source timestamp.' });
      return;
    }
    const effects = await processPullRequestEvent({
      deliveryId, action, repoUrl, prUrl: pr.html_url, number: pr.number,
      title: String(pr.title ?? ''), branch: String(pr.head?.ref ?? ''),
      merged: pr.merged === true, sourceUpdatedAt: updatedAt,
      externalAuthor: pr.user?.login, externalSender: payload.sender?.login,
    });
    // Durable work is committed before any realtime notification is sent.
    for (const effect of effects) {
      const ticket = await getTicketById(effect.ticketId, effect.projectId);
      broadcastToWorkspace(effect.workspaceId, 'tickets-updated', {
        projectId: effect.projectId, ticketId: effect.ticketId,
        ...(ticket ? { ticket } : {}), actorUserId: GITHUB_AUTOMATION_ACTOR,
      });
      if (effect.commentAdded) broadcastToWorkspace(effect.workspaceId, 'comments-updated', {
        ticketId: effect.ticketId, actorUserId: GITHUB_AUTOMATION_ACTOR,
      });
    }
    res.json({ success: true });
  });
  return router;
}
