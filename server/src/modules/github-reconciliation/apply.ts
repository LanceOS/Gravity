import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { projects, tickets } from '../../db/schema.js';
import { audit } from '../../lib/logger.js';
import { broadcastToWorkspace } from '../../realtime.js';
import { getTicketById } from '../tickets/services/tickets.js';
import { processPullRequestEvent, PullRequestReconciliationError, GITHUB_AUTOMATION_ACTOR, normalizeGitHubPullRequestUrl } from '../webhooks/processPullRequest.js';
import { digest, readPlan, ticketRevision } from './preview.js';
import { fetchPullRequests, ReconciliationError, repositoryName } from './github.js';

type Selection = { candidateId: string; reviewed: boolean };
type Result = { candidateId: string; ticketKey: string; prNumber: number; outcome: 'applied' | 'unchanged' | 'stale' | 'protected' | 'failed'; reason?: string };
export async function applyReconciliation(projectId: string, actorId: string, previewToken: string, selections: Selection[], credential?: string) {
  const plan = readPlan(previewToken, actorId, projectId);
  const selected = selections.map(selection => {
    const candidate = plan.candidates.find(item => item.id === selection.candidateId);
    if (!candidate) throw new ReconciliationError('Selected match is not in this preview.');
    if (candidate.protected) throw new ReconciliationError('Protected matches cannot be applied. Manual decisions must be handled on the ticket.');
    if (candidate.requiresReview && !selection.reviewed) throw new ReconciliationError('Ambiguous matches require individual review.');
    return candidate;
  });
  if (new Set(selected.map(item => item.ticketId)).size !== selected.length) throw new ReconciliationError('Select only one PR per ticket.');
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project || repositoryName(project.githubRepoUrl ?? '') !== plan.repo) throw new ReconciliationError('Linked repository changed. Run a new preview.', 409);
  const fresh = await fetchPullRequests(plan.repo, plan.scan, credential);
  if (digest([fresh.pulls, fresh.incomplete, fresh.nextPage]) !== plan.pullsDigest) throw new ReconciliationError('GitHub PR evidence changed. Run a new preview.', 409);
  const results: Result[] = [];
  for (const candidate of selected) {
    try {
      const [current] = await db.select().from(tickets).where(eq(tickets.id, candidate.ticketId)).limit(1);
      if (!current || current.projectId !== projectId) throw new PullRequestReconciliationError('stale');
      if (current.status === 'done' && current.prStatus === 'merged' && normalizeGitHubPullRequestUrl(current.prUrl ?? '') === candidate.pull.url) {
        results.push({ candidateId: candidate.id, ticketKey: candidate.ticketKey, prNumber: candidate.pull.number, outcome: 'unchanged' });
        continue;
      }
      if (ticketRevision(current) !== candidate.revision) throw new PullRequestReconciliationError('stale');
      const effects = await processPullRequestEvent({
        // A fresh preview can repair a restored ticket even if an old delivery ledger survived.
        deliveryId: `reconciliation:${digest([previewToken, candidate.id])}`,
        action: 'closed', repoUrl: `https://github.com/${plan.repo}`, prUrl: candidate.pull.url,
        number: candidate.pull.number, title: candidate.pull.title, branch: candidate.pull.branch,
        merged: true, sourceUpdatedAt: new Date(candidate.pull.updatedAt), externalAuthor: '', externalSender: '',
        reconciliation: { projectId, actorUserId: actorId, ticketId: candidate.ticketId,
          expected: candidate.expected, reviewed: true, evidence: candidate.evidence,
          mergedAt: new Date(candidate.pull.mergedAt!) },
      });
      const [updated] = await db.select().from(tickets).where(eq(tickets.id, candidate.ticketId)).limit(1);
      if (!updated || updated.status !== 'done' || updated.prStatus !== 'merged' || normalizeGitHubPullRequestUrl(updated.prUrl ?? '') !== candidate.pull.url) {
        throw new PullRequestReconciliationError('protected');
      }
      results.push({ candidateId: candidate.id, ticketKey: candidate.ticketKey, prNumber: candidate.pull.number, outcome: effects.length ? 'applied' : 'unchanged' });
      // The transaction is committed. An SSE failure must not turn a successful write into failure.
      try {
        for (const effect of effects) {
          const ticket = await getTicketById(effect.ticketId, effect.projectId);
          broadcastToWorkspace(effect.workspaceId, 'tickets-updated', {
            projectId: effect.projectId, ticketId: effect.ticketId, ...(ticket ? { ticket } : {}), actorUserId: GITHUB_AUTOMATION_ACTOR,
          });
          if (effect.commentAdded) broadcastToWorkspace(effect.workspaceId, 'comments-updated', { ticketId: effect.ticketId, actorUserId: GITHUB_AUTOMATION_ACTOR });
        }
      } catch { audit('github.reconciliation.notification_failed', { projectId, ticketId: candidate.ticketId }); }
    } catch (error) {
      const outcome = error instanceof PullRequestReconciliationError ? error.code : 'failed';
      results.push({ candidateId: candidate.id, ticketKey: candidate.ticketKey, prNumber: candidate.pull.number, outcome,
        reason: outcome === 'stale' ? 'Ticket changed since preview. Preview again.'
          : outcome === 'protected' ? 'A manual decision or conflicting PR state was preserved.' : 'Update failed. Run a new preview before retrying.' });
    }
  }
  audit('github.reconciliation.apply', { projectId, actorUserId: actorId, repository: plan.repo, results });
  return { results };
}
