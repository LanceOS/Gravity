import { normalizeGitHubPullRequestUrl } from '../webhooks/processPullRequest.js';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../env.js';
import type { tickets } from '../../db/schema.js';
import { ReconciliationError, type PullRequest, type Scan } from './github.js';

type Ticket = Pick<typeof tickets.$inferSelect, 'id' | 'projectId' | 'key' | 'title' | 'branchName' | 'status' | 'prStatus' | 'prUrl' | 'updatedAt'>;
export type Candidate = {
  id: string; ticketId: string; ticketKey: string; ticketTitle: string;
  pull: PullRequest; evidence: string[]; confidence: 'explicit' | 'suggested';
  conflicts: string[]; protected: boolean; requiresReview: boolean;
  current: { status: string; prStatus: string; prUrl: string | null };
  proposed: { status: string; prStatus: string; prUrl: string };
  revision: string; noChange: boolean;
  expected: { updatedAt: string; status: string; prStatus: string; prUrl: string | null; key: string; title: string; branchName: string };
};
export type Plan = {
  version: 1; actorId: string; projectId: string; repo: string; expiresAt: number;
  scan: Scan; pullsDigest: string; candidates: Candidate[];
};
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const ticketRevision = (ticket: Ticket) => digest([
  ticket.id, ticket.projectId, ticket.key, ticket.title, ticket.branchName,
  ticket.status, ticket.prStatus, ticket.prUrl, ticket.updatedAt.toISOString(),
]);

function words(title: string) {
  return new Set(title.toLowerCase().replace(/[a-z]+-\d+/g, '').match(/[a-z0-9]{3,}/g) ?? []);
}
function similarTitle(left: Set<string>, right: Set<string>) {
  const common = [...left].filter(word => right.has(word)).length;
  return common >= 3 && common / new Set([...left, ...right]).size >= 0.6;
}
function keys(text: string) {
  return new Set([...text.matchAll(/(?:^|[^a-z0-9])([a-z]+-\d+)(?=$|[^a-z0-9])/gi)].map(match => match[1].toUpperCase()));
}

export function buildCandidates(rows: Ticket[], pulls: PullRequest[], incomplete: boolean, tracked: Array<{ ticketId: string; prUrl: string; status: string }> = []): Candidate[] {
  const candidates: Candidate[] = [];
  const evidenceIndex = pulls.map(pull => ({ pull, titleKeys: keys(pull.title), branchKeys: keys(pull.branch), titleWords: words(pull.title) }));
  const openByTicket = new Map<string, Set<string>>();
  for (const link of tracked) {
    if (link.status !== 'open') continue;
    const urls = openByTicket.get(link.ticketId) ?? new Set<string>();
    urls.add(link.prUrl); openByTicket.set(link.ticketId, urls);
  }
  for (const ticket of rows) {
    const ticketWords = words(ticket.title);
    const linkedPrUrl = normalizeGitHubPullRequestUrl(ticket.prUrl ?? '');
    const matches = evidenceIndex.map(({ pull, titleKeys, branchKeys, titleWords }) => {
      const evidence: string[] = [];
      if (titleKeys.has(ticket.key.toUpperCase())) evidence.push('Ticket key in PR title');
      if (branchKeys.has(ticket.key.toUpperCase())) evidence.push('Ticket key in PR branch');
      if (ticket.branchName && pull.branch === ticket.branchName) evidence.push('Exact ticket branch');
      if (linkedPrUrl === pull.url) evidence.push('Existing ticket PR link');
      const explicit = evidence.length > 0;
      if (!explicit && similarTitle(ticketWords, titleWords)) evidence.push('Similar title (suggestion only)');
      return { pull, evidence, explicit };
    }).filter(match => match.evidence.length > 0);
    for (const { pull, evidence, explicit } of matches) {
      // Open/abandoned PRs remain visible as competing evidence, but cannot complete tickets.
      const noChange = ticket.status === 'done' && ticket.prStatus === 'merged' && linkedPrUrl === pull.url;
      const conflicts: string[] = [];
      const protectedReasons: string[] = [];
      if (!pull.mergedAt) protectedReasons.push('PR is not merged');
      if (!noChange) {
        if ([...(openByTicket.get(ticket.id) ?? [])].some(url => normalizeGitHubPullRequestUrl(url) !== pull.url)) protectedReasons.push('Another tracked PR is open: unresolved work preserved');
        if (ticket.status === 'canceled') protectedReasons.push('Canceled ticket: manual decision preserved');
        if (ticket.prUrl && linkedPrUrl !== pull.url) protectedReasons.push('Ticket links a different PR: existing link preserved');
        if (ticket.prStatus === 'merged' && ticket.status !== 'done') protectedReasons.push('Ticket reopened after merge: manual status preserved');
        if (pull.mergedAt && ticket.updatedAt.getTime() > Date.parse(pull.mergedAt)) protectedReasons.push('Ticket edited after PR merge: newer changes preserved');
      }
      if (!explicit) conflicts.push('Title similarity requires individual review');
      if (matches.length > 1) conflicts.push('Multiple matching PRs: choose one after review');
      if (incomplete) conflicts.push('Partial repository scan: other matching PRs may exist');
      if (candidates.length >= 500) throw new ReconciliationError('More than 500 matches. Reduce the page count and preview smaller batches.', 422);
      candidates.push({
        id: `${ticket.id}:${pull.number}`, ticketId: ticket.id, ticketKey: ticket.key, ticketTitle: ticket.title,
        pull, evidence, confidence: explicit ? 'explicit' : 'suggested',
        conflicts: [...conflicts, ...protectedReasons], protected: protectedReasons.length > 0,
        requiresReview: conflicts.length > 0, revision: ticketRevision(ticket), noChange,
        expected: { updatedAt: ticket.updatedAt.toISOString(), status: ticket.status, prStatus: ticket.prStatus, prUrl: ticket.prUrl, key: ticket.key, title: ticket.title, branchName: ticket.branchName },
        current: { status: ticket.status, prStatus: ticket.prStatus, prUrl: ticket.prUrl },
        proposed: { status: 'done', prStatus: 'merged', prUrl: pull.url },
      });
    }
  }
  return candidates;
}

export function signPlan(plan: Plan): string {
  const body = Buffer.from(JSON.stringify(plan)).toString('base64url');
  const signature = createHmac('sha256', env.betterAuthSecret).update(`github-reconciliation:${body}`).digest('base64url');
  return `${body}.${signature}`;
}
export function readPlan(token: string, actorId: string, projectId: string): Plan {
  try {
    const [body, signature, extra] = token.split('.');
    const expected = createHmac('sha256', env.betterAuthSecret).update(`github-reconciliation:${body}`).digest();
    const actual = Buffer.from(signature ?? '', 'base64url');
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const plan = JSON.parse(Buffer.from(body, 'base64url').toString()) as Plan;
    if (plan.version !== 1 || plan.actorId !== actorId || plan.projectId !== projectId || plan.expiresAt <= Date.now()) throw new Error();
    return plan;
  } catch {
    throw new ReconciliationError('Preview expired or invalid. Run a new preview.', 409);
  }
}
