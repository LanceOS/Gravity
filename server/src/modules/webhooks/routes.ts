import { eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.js';
import { projects, teams, tickets } from '../../db/schema.js';
import { env } from '../../env.js';
import { verifyGitHubWebhookSignature, isValidGitHubUrl, sanitizeGitHubLogin } from '../../lib/webhookSignature.js';
import { broadcastToWorkspace } from '../../realtime.js';
import { addCommentRecord, updateTicketRecord } from '../tickets/services/tickets.js';

/** Maximum number of ticket keys to process from a single webhook delivery. */
const MAX_KEYS_PER_WEBHOOK = 10;

/** Ticket key pattern: one or more letters, a hyphen, one or more digits. */
const TICKET_KEY_REGEX = /([A-Za-z]+)-(\d+)/g;

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
    const clientIp = String(req.ip ?? req.socket?.remoteAddress ?? 'unknown');
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
    } else if (env.nodeEnv === 'production') {
      // In production, reject all webhook requests if no secret is configured
      // to prevent accidental unauthenticated delivery acceptance.
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
    const pr = payload?.pull_request;
    if (!pr) {
      res.status(400).json({ error: 'Missing pull_request payload.' });
      return;
    }

    // ── Finding #6: Validate prUrl before storing ─────────────────────────────
    const rawPrUrl = String(pr.html_url || '');
    const prUrl = isValidGitHubUrl(rawPrUrl) ? rawPrUrl : '';

    const isMerged = Boolean(pr.merged);

    // ── Repository URL resolution & project matching ──────────────────────────
    const rawRepoUrl = String(pr.base?.repo?.html_url || payload?.repository?.html_url || '');
    if (!rawRepoUrl) {
      res.status(400).json({ error: 'Missing repository url.' });
      return;
    }

    const linkedProjects = await db
      .select({ id: projects.id, createdBy: projects.createdBy })
      .from(projects)
      .where(eq(projects.githubRepoUrl, rawRepoUrl));

    if (linkedProjects.length === 0) {
      // ── Finding #8: Uniform response — don't confirm project existence ──────
      res.json({ success: true });
      return;
    }

    const linkedProjectIds = linkedProjects.map((p) => p.id);
    // Build a map from projectId -> createdBy to avoid a per-ticket DB query later.
    const projectCreatedBy = new Map(linkedProjects.map((p) => [p.id, p.createdBy]));

    // Build a map from projectId -> workspaceId for scoped SSE broadcasts.
    const projectWorkspaceRows = await db
      .select({ id: projects.id, workspaceId: teams.workspaceId })
      .from(projects)
      .innerJoin(teams, eq(teams.id, projects.teamId))
      .where(inArray(projects.id, linkedProjectIds));
    const projectWorkspaceMap = new Map(projectWorkspaceRows.map((r) => [r.id, r.workspaceId]));

    // ── Ticket key extraction ─────────────────────────────────────────────────
    const prTitle = String(pr.title || '');
    const prBranch = String(pr.head?.ref || '');
    const keysFound = new Set<string>();

    let match: RegExpExecArray | null;

    const titleRegex = new RegExp(TICKET_KEY_REGEX.source, 'g');
    while ((match = titleRegex.exec(prTitle)) !== null) {
      keysFound.add(match[0].toUpperCase());
    }

    const branchRegex = new RegExp(TICKET_KEY_REGEX.source, 'g');
    while ((match = branchRegex.exec(prBranch)) !== null) {
      keysFound.add(match[0].toUpperCase());
    }

    // ── Finding #7: Cap keys to avoid N+1 query storms ───────────────────────
    const keysToProcess = [...keysFound].slice(0, MAX_KEYS_PER_WEBHOOK);

    if (keysToProcess.length === 0) {
      res.json({ success: true });
      return;
    }

    // ── Finding #7 (continued): Batch ticket lookup instead of N sequential queries
    const ticketRows = await db
      .select()
      .from(tickets)
      .where(inArray(tickets.key, keysToProcess));

    // Filter to only tickets that belong to a linked project.
    const relevantTickets = ticketRows.filter((t) => linkedProjectIds.includes(t.projectId));

    if (relevantTickets.length === 0) {
      res.json({ success: true });
      return;
    }

    // ── Finding #4: Sanitize attacker-controlled values used in comment text ──
    const prNumber = Number.isInteger(Number(pr.number)) && Number(pr.number) > 0
      ? Number(pr.number)
      : 0;
    const prAuthor = sanitizeGitHubLogin(pr.user?.login);

    // Determine the action description for the comment body.
    const eventDescription = action === 'closed' && isMerged ? 'merged' : String(action || 'updated');

    // ── Status mapping per PR lifecycle action ────────────────────────────────
    let nextPrStatus: 'open' | 'merged' | 'closed' | 'none' = 'none';
    let nextTicketStatus: string | null = null; // null = leave unchanged

    if (action === 'opened' || action === 'reopened') {
      nextPrStatus = 'open';
      nextTicketStatus = 'in_progress';
    } else if (action === 'review_requested' || action === 'ready_for_review') {
      nextPrStatus = 'open';
      nextTicketStatus = 'in_review';
    } else if (action === 'closed' && isMerged) {
      nextPrStatus = 'merged';
      nextTicketStatus = 'done';
    } else if (action === 'closed') {
      nextPrStatus = 'closed';
      // Intentionally leave ticket status unchanged for abandoned PRs.
    }

    // ── Process each matched ticket ───────────────────────────────────────────
    for (const ticket of relevantTickets) {
      const updated = await updateTicketRecord(
        ticket.id,
        {
          prStatus: nextPrStatus,
          prUrl: prUrl || null,
          status: nextTicketStatus ?? ticket.status,
        },
        ticket.projectId,
      );

      if (!updated) continue;

      const workspaceId = projectWorkspaceMap.get(updated.projectId) ?? '';

      // Reuse the already-loaded createdBy from the linked project rather than
      // firing an additional DB query per ticket.
      const commentUserId = updated.assigneeId || projectCreatedBy.get(updated.projectId);
      if (commentUserId) {
        const commentBody = `GitHub PR update: #${prNumber} was ${eventDescription} by ${prAuthor}${prUrl ? ` (${prUrl})` : ''}.`;

        await addCommentRecord(updated.id, commentUserId, commentBody);
        if (workspaceId) broadcastToWorkspace(workspaceId, 'comments-updated', { ticketId: updated.id });
      }

      if (workspaceId) {
        broadcastToWorkspace(workspaceId, 'tickets-updated', { projectId: updated.projectId });
      }
    }

    // ── Finding #8: Always return uniform success ─────────────────────────────
    res.json({ success: true });
  });

  return router;
}
