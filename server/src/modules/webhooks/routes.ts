import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.js';
import { projects } from '../../db/schema.js';
import { broadcastEvent } from '../../realtime.js';
import { addCommentRecord, getTicketByKey, listComments, listTickets, updateTicketRecord } from '../tickets/services/tickets.js';

export function createWebhookRouter() {
  const router = Router();

  router.post('/webhooks/github', async (req, res) => {
    const event = req.header('x-github-event');
    const payload = req.body;

    if (event !== 'pull_request') {
      res.json({ success: true, message: 'Webhook received but no matching tickets found' });
      return;
    }

    const action = payload?.action;
    const pr = payload?.pull_request;
    if (!pr) {
      res.status(400).json({ error: 'Missing pull_request payload' });
      return;
    }

    const prTitle = pr.title || '';
    const prBranch = pr.head?.ref || '';
    const prUrl = pr.html_url || '';
    const isMerged = Boolean(pr.merged);
    const ticketKeyRegex = /([A-Za-z]+)-\d+/g;
    const keysFound = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = ticketKeyRegex.exec(prTitle)) !== null) {
      keysFound.add(match[0].toUpperCase());
    }
    while ((match = ticketKeyRegex.exec(prBranch)) !== null) {
      keysFound.add(match[0].toUpperCase());
    }

    const updatedKeys: string[] = [];

    for (const key of keysFound) {
      const ticket = await getTicketByKey(key);
      if (!ticket) {
        continue;
      }

      let nextPrStatus: 'open' | 'merged' | 'closed' | 'none' = 'none';
      let nextTicketStatus = ticket.status;

      if (action === 'opened' || action === 'reopened') {
        nextPrStatus = 'open';
        nextTicketStatus = 'in_review';
      } else if (action === 'closed' && isMerged) {
        nextPrStatus = 'merged';
        nextTicketStatus = 'done';
      } else if (action === 'closed') {
        nextPrStatus = 'closed';
      }

      const updated = await updateTicketRecord(
        ticket.id,
        {
          prStatus: nextPrStatus,
          prUrl,
          status: nextTicketStatus,
        },
        ticket.projectId,
      );

      if (!updated) {
        continue;
      }

      const projectRows = await db.select().from(projects).where(eq(projects.id, ticket.projectId)).limit(1);
      const commentUserId = updated.assigneeId || projectRows[0]?.createdBy;
      if (commentUserId) {
        await addCommentRecord(
          updated.id,
          commentUserId,
          `GitHub PR update: #${pr.number} was ${action === 'closed' && isMerged ? 'merged' : action} by ${pr.user?.login || 'developer'} (${prUrl}).`,
        );
        broadcastEvent('comments-updated', { ticketId: updated.id, comments: await listComments(updated.id) });
      }

      broadcastEvent('tickets-updated', {
        projectId: updated.projectId,
        tickets: await listTickets(updated.projectId),
      });

      updatedKeys.push(updated.key);
    }

    if (updatedKeys.length > 0) {
      res.json({ success: true, updatedTickets: updatedKeys });
      return;
    }

    res.json({ success: true, message: 'Webhook received but no matching tickets found' });
  });

  return router;
}