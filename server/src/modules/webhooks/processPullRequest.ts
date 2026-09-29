import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { comments, githubDeliveries, githubPullRequests, projects, teams, ticketPullRequests, ticketRelationships, tickets } from '../../db/schema.js';
import { createId } from '../../lib/platform.js';
import { sanitizeGitHubLogin } from '../../lib/webhookSignature.js';

export const GITHUB_AUTOMATION_ACTOR = 'system:webhook';
export const SUPPORTED_PR_ACTIONS = new Set(['opened', 'reopened', 'review_requested', 'ready_for_review', 'closed']);

export interface PullRequestEvent {
  deliveryId: string;
  action: string;
  repoUrl: string;
  prUrl: string;
  number: number;
  title: string;
  branch: string;
  merged: boolean;
  sourceUpdatedAt: Date;
  externalAuthor: string;
  externalSender: string;
  reconciliation?: {
    projectId: string;
    actorUserId: string;
    ticketId: string;
    expected: { updatedAt: string; status: string; prStatus: string; prUrl: string | null; key: string; title: string; branchName: string };
    reviewed: boolean;
    evidence: string[];
    mergedAt: Date;
  };
}

export class PullRequestReconciliationError extends Error {
  constructor(public readonly code: 'stale' | 'protected') {
    super(`Pull request reconciliation ${code}.`);
  }
}

export interface PullRequestEffect {
  ticketId: string;
  projectId: string;
  workspaceId: string;
  commentAdded: boolean;
}

export function normalizeGitHubRepositoryUrl(value: string): string | null {
  const match = /^https:\/\/github\.com\/([a-z0-9-]+)\/([a-z0-9_.-]+?)\/?$/i.exec(value);
  return match ? `https://github.com/${match[1]}/${match[2].replace(/\.git$/i, '')}`.toLowerCase() : null;
}

export function normalizeGitHubPullRequestUrl(value: string): string | null {
  const match = /^https:\/\/github\.com\/([a-z0-9-]+)\/([a-z0-9_.-]+)\/pull\/([1-9][0-9]*)\/?$/i.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[3]))) return null;
  return `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`.toLowerCase();
}

const rank: Record<string, number> = { in_progress: 0, in_review: 1, closed: 2, merged: 3 };

/** Process one authenticated snapshot. All durable effects commit together; publish SSE after return.
 * Reconciliation may supply a stable, namespaced deliveryId and the GitHub updated_at timestamp.
 */
export async function processPullRequestEvent(input: PullRequestEvent): Promise<PullRequestEffect[]> {
  if (!SUPPORTED_PR_ACTIONS.has(input.action)) return [];
  const normalizedRepo = normalizeGitHubRepositoryUrl(input.repoUrl);
  const event = { ...input, repoUrl: normalizedRepo ?? input.repoUrl,
    prUrl: normalizeGitHubPullRequestUrl(input.prUrl) ?? '' };

  if (!event.deliveryId || event.deliveryId.length > 255 || !normalizedRepo
    || !Number.isSafeInteger(event.number) || event.number <= 0
    || event.prUrl !== `${event.repoUrl}/pull/${event.number}`
    || !Number.isFinite(event.sourceUpdatedAt.getTime())) {
    throw new Error('Invalid pull request event.');
  }
  const reconciliation = event.reconciliation;
  if (reconciliation && (event.action !== 'closed' || !event.merged
    || !Number.isFinite(reconciliation.mergedAt.getTime()) || !reconciliation.reviewed)) {
    throw new PullRequestReconciliationError('protected');
  }
  const keys = [...new Set(`${event.title} ${event.branch}`.match(/[A-Za-z]+-\d+/g)?.map(key => key.toUpperCase()) ?? [])].slice(0, 10);
  const status = event.action === 'closed' ? (event.merged ? 'merged' : 'closed') : 'open';
  const phase = status !== 'open' ? status
    : ['review_requested', 'ready_for_review'].includes(event.action) ? 'in_review' : 'in_progress';

  return db.transaction(async tx => {
    // Reconciliation uses its locked expected-state guard and current-state no-op
    // check instead: a restored ticket must remain repairable even if a delivery
    // ledger or PR snapshot survived the restore.
    if (!reconciliation) {
      const claimed = await tx.insert(githubDeliveries).values({ id: event.deliveryId })
        .onConflictDoNothing().returning();
      if (claimed.length === 0) return [];
    }

    // The same project locks are used by ordinary ticket writes/moves. Lock before
    // reading tickets so concurrent PRs cannot compute aggregates from old state.
    const linkedProjects = await tx.select().from(projects)
      .where(and(
        inArray(sql`lower(${projects.githubRepoUrl})`, [event.repoUrl, `${event.repoUrl}/`, `${event.repoUrl}.git`, `${event.repoUrl}.git/`]),
        reconciliation ? eq(projects.id, reconciliation.projectId) : undefined,
      )).orderBy(asc(projects.id)).for('update');
    if (linkedProjects.length === 0) {
      if (reconciliation) throw new PullRequestReconciliationError('stale');
      return [];
    }
    // Seed and lock a PR-wide ordering record even if this payload has no ticket
    // key. Otherwise an older payload can introduce a new stale association.
    await tx.insert(githubPullRequests).values({
      prUrl: event.prUrl, status, phase, sourceUpdatedAt: event.sourceUpdatedAt,
    }).onConflictDoNothing();
    const [latest] = await tx.select().from(githubPullRequests)
      .where(eq(githubPullRequests.prUrl, event.prUrl)).for('update');
    if (!reconciliation && ((latest.status === 'merged' && status !== 'merged')
      || latest.sourceUpdatedAt > event.sourceUpdatedAt
      || (latest.sourceUpdatedAt.getTime() === event.sourceUpdatedAt.getTime()
        && rank[latest.phase] > rank[phase]))) return [];
    await tx.update(githubPullRequests).set({ status, phase, sourceUpdatedAt: event.sourceUpdatedAt })
      .where(eq(githubPullRequests.prUrl, event.prUrl));

    const projectIds = linkedProjects.map(project => project.id);
    const scopes = await tx.select({ projectId: projects.id, workspaceId: teams.workspaceId })
      .from(projects).innerJoin(teams, eq(teams.id, projects.teamId)).where(inArray(projects.id, projectIds));
    const workspaceIds = new Map(scopes.map(scope => [scope.projectId, scope.workspaceId]));
    // Once linked, retain the identity even if a PR's title/branch loses its key.
    const previousLinks = await tx.select({ ticketId: ticketPullRequests.ticketId }).from(ticketPullRequests)
      .where(eq(ticketPullRequests.prUrl, event.prUrl));
    const previousIds = previousLinks.map(link => link.ticketId);
    if (!reconciliation && !keys.length && !previousIds.length) return [];
    const matchedTickets = await tx.select().from(tickets).where(and(
      inArray(tickets.projectId, projectIds),
      reconciliation ? eq(tickets.id, reconciliation.ticketId) : or(keys.length ? inArray(tickets.key, keys) : undefined,
        previousIds.length ? inArray(tickets.id, previousIds) : undefined),
    )).orderBy(asc(tickets.id)).for('update');
    if (reconciliation && !matchedTickets.length) throw new PullRequestReconciliationError('stale');
    const effects = new Map<string, PullRequestEffect>();
    const addEffect = (ticket: { id: string; projectId: string }, commentAdded = false) => {
      const workspaceId = workspaceIds.get(ticket.projectId);
      if (workspaceId) effects.set(ticket.id, {
        ticketId: ticket.id, projectId: ticket.projectId, workspaceId,
        commentAdded: commentAdded || effects.get(ticket.id)?.commentAdded || false,
      });
    };

    for (const ticket of matchedTickets) {
      const existingPrUrl = ticket.prUrl ? normalizeGitHubPullRequestUrl(ticket.prUrl) ?? ticket.prUrl : null;
      if (reconciliation) {
        if (ticket.status === 'done' && ticket.prStatus === 'merged' && existingPrUrl === event.prUrl) continue;
        const { expected } = reconciliation;
        if (ticket.updatedAt.toISOString() !== expected.updatedAt
          || (['status', 'prStatus', 'prUrl', 'key', 'title', 'branchName'] as const).some(key => ticket[key] !== expected[key])) {
          throw new PullRequestReconciliationError('stale');
        }
        const otherLinks = await tx.select().from(ticketPullRequests).where(eq(ticketPullRequests.ticketId, ticket.id));
        if (ticket.status === 'canceled' || (existingPrUrl && existingPrUrl !== event.prUrl)
          || (ticket.prStatus === 'merged' && ticket.status !== 'done')
          || ticket.updatedAt > reconciliation.mergedAt
          || otherLinks.some(link => link.prUrl !== event.prUrl && link.status === 'open')) {
          throw new PullRequestReconciliationError('protected');
        }
      }
      const [previous] = await tx.select().from(ticketPullRequests).where(and(
        eq(ticketPullRequests.ticketId, ticket.id), eq(ticketPullRequests.prUrl, event.prUrl),
      ));
      // Merges are irreversible. Equal timestamps resolve deterministically toward
      // more advanced phases because GitHub timestamps have only second precision.
      if (!reconciliation && previous && (previous.status === 'merged'
        || previous.sourceUpdatedAt > event.sourceUpdatedAt
        || (previous.sourceUpdatedAt.getTime() === event.sourceUpdatedAt.getTime()
          && rank[previous.phase] >= rank[phase]))) continue;
      if (!reconciliation && !previous && existingPrUrl === event.prUrl && ticket.prStatus === 'merged' && status !== 'merged') continue;

      // Preserve a legacy/manual link when a second PR starts being tracked.
      if (existingPrUrl && existingPrUrl !== event.prUrl && ['open', 'merged', 'closed'].includes(ticket.prStatus)) {
        await tx.insert(ticketPullRequests).values({
          ticketId: ticket.id, prUrl: existingPrUrl, repoUrl: existingPrUrl.split('/pull/')[0],
          status: ticket.prStatus, phase: ticket.prStatus === 'open'
            ? (ticket.status === 'in_review' ? 'in_review' : 'in_progress') : ticket.prStatus,
          sourceUpdatedAt: new Date(0),
        }).onConflictDoNothing();
      }
      await tx.insert(ticketPullRequests).values({
        ticketId: ticket.id, prUrl: event.prUrl, repoUrl: event.repoUrl,
        status, phase, sourceUpdatedAt: event.sourceUpdatedAt,
      }).onConflictDoUpdate({
        target: [ticketPullRequests.ticketId, ticketPullRequests.prUrl],
        set: { status, phase, sourceUpdatedAt: event.sourceUpdatedAt },
      });
      // A newer snapshot of an unchanged lifecycle is useful for ordering only.
      if (!reconciliation && previous?.status === status && previous.phase === phase) continue;
      const links = await tx.select().from(ticketPullRequests).where(eq(ticketPullRequests.ticketId, ticket.id));
      const open = links.filter(link => link.status === 'open');
      const merged = links.filter(link => link.status === 'merged');
      const terminal = ticket.status === 'done' || ticket.status === 'canceled';
      const candidates = terminal && merged.length ? merged : open.length ? open : merged.length ? merged : links;
      candidates.sort((a, b) => b.sourceUpdatedAt.getTime() - a.sourceUpdatedAt.getTime() || a.prUrl.localeCompare(b.prUrl));
      const summary = reconciliation ? { status: 'merged', prUrl: event.prUrl } : candidates[0];
      const nextStatus = reconciliation ? 'done' : terminal ? ticket.status : open.length
        ? (open.some(link => link.phase === 'in_review') ? 'in_review' : 'in_progress')
        : merged.length ? 'done' : ticket.status;
      await tx.update(tickets).set({
        status: nextStatus, prStatus: summary.status, prUrl: summary.prUrl,
        updatedAt: new Date(Math.max(Date.now(), ticket.updatedAt.getTime() + 1)),
      }).where(eq(tickets.id, ticket.id));
      if (nextStatus === 'done' || nextStatus === 'canceled') {
        const removed = await tx.delete(ticketRelationships).where(or(
          eq(ticketRelationships.ticketId, ticket.id), eq(ticketRelationships.blockedTicketId, ticket.id),
        )).returning();
        const affectedIds = [...new Set(removed.flatMap(row => [row.ticketId, row.blockedTicketId]))].filter(id => id !== ticket.id);
        if (affectedIds.length) {
          const affected = await tx.update(tickets).set({ updatedAt: new Date() }).where(inArray(tickets.id, affectedIds)).returning();
          for (const other of affected) addEffect(other);
        }
      }
      const author = sanitizeGitHubLogin(event.externalAuthor);
      const sender = sanitizeGitHubLogin(event.externalSender);
      await tx.insert(comments).values({
        id: createId('co'), ticketId: ticket.id, userId: GITHUB_AUTOMATION_ACTOR,
        body: `GitHub PR update: #${event.number} was ${status === 'merged' ? 'merged' : event.action} (${event.prUrl}).`,
        automation: { provider: 'github', deliveryId: event.deliveryId, prUrl: event.prUrl,
          action: event.action, externalAuthor: author, externalSender: sender,
          source: reconciliation ? 'reconciliation' : 'webhook',
          ...(reconciliation ? { actorUserId: reconciliation.actorUserId, evidence: reconciliation.evidence,
            before: { status: ticket.status, prStatus: ticket.prStatus, prUrl: ticket.prUrl },
            after: { status: nextStatus, prStatus: summary.status, prUrl: summary.prUrl } } : {}),
        },
      });
      addEffect(ticket, true);
    }
    return [...effects.values()];
  });
}
