import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { comments, githubDeliveries, githubPullRequests, projects, ticketPullRequests, ticketRelationships, tickets } from '../src/db/schema.js';
import { listComments } from '../src/modules/tickets/services/tickets.js';
import { normalizeGitHubPullRequestUrl, processPullRequestEvent, type PullRequestEvent } from '../src/modules/webhooks/processPullRequest.js';
import { seedTicket, seedWorkspaceFixture } from './helpers/test-helpers.js';

const repoUrl = 'https://github.com/test/repo';
async function fixture() {
  const { project } = await seedWorkspaceFixture();
  await db.update(projects).set({ githubRepoUrl: repoUrl }).where(eq(projects.id, project.id));
  const ticket = await seedTicket(project.id, { key: `${project.key}-1`, status: 'todo' });
  return { project, ticket };
}
function event(key: string, overrides: Partial<PullRequestEvent> = {}): PullRequestEvent {
  return {
    deliveryId: 'delivery-1', action: 'opened', repoUrl, prUrl: `${repoUrl}/pull/42`, number: 42,
    title: key, branch: '', merged: false, sourceUpdatedAt: new Date('2026-09-29T12:00:00Z'),
    externalAuthor: 'author', externalSender: 'sender', ...overrides,
  };
}
async function readTicket(id: string) {
  return (await db.select().from(tickets).where(eq(tickets.id, id)))[0];
}

describe('GitHub webhook reliability', () => {
  it.each(['synchronize', 'edited', 'labeled'])('ignores %s without any persistent effects', async action => {
    const { ticket } = await fixture();
    await db.update(tickets).set({ status: 'done', prStatus: 'merged', prUrl: `${repoUrl}/pull/42` }).where(eq(tickets.id, ticket.id));
    const before = await readTicket(ticket.id);
    expect(await processPullRequestEvent(event(ticket.key, { action }))).toEqual([]);
    expect(await readTicket(ticket.id)).toEqual(before);
    expect(await db.select().from(comments)).toHaveLength(0);
    expect(await db.select().from(githubDeliveries)).toHaveLength(0);
  });

  it('deduplicates deliveries and attributes visible comments to automation with external metadata', async () => {
    const { ticket } = await fixture();
    const input = event(ticket.key);
    expect(await processPullRequestEvent(input)).toHaveLength(1);
    const after = await readTicket(ticket.id);
    expect(await processPullRequestEvent(input)).toEqual([]);
    expect(await readTicket(ticket.id)).toEqual(after);
    expect(await db.select().from(githubDeliveries)).toHaveLength(1);
    expect(await listComments(ticket.id)).toMatchObject([{
      userId: 'system:webhook', userName: 'GitHub automation', author: { role: 'system' },
      automation: { externalAuthor: 'author', externalSender: 'sender', deliveryId: 'delivery-1', source: 'webhook' },
    }]);
  });

  it('rejects old events and resolves timestamp ties toward merged, without reopening completed work', async () => {
    const { ticket } = await fixture();
    await processPullRequestEvent(event(ticket.key, { action: 'closed', merged: true }));
    const completed = await readTicket(ticket.id);
    for (const [index, time] of ['2026-09-28T12:00:00Z', '2026-09-29T12:00:00Z', '2026-09-30T12:00:00Z'].entries()) {
      expect(await processPullRequestEvent(event(ticket.key, { action: 'reopened', deliveryId: `late-${index}`, sourceUpdatedAt: new Date(time) }))).toEqual([]);
    }
    expect(await readTicket(ticket.id)).toEqual(completed);
    expect(completed).toMatchObject({ status: 'done', prStatus: 'merged' });
    expect(await db.select().from(comments)).toHaveLength(1);
  });

  it('does not let an older open snapshot erase a review request', async () => {
    const { ticket } = await fixture();
    await processPullRequestEvent(event(ticket.key, { action: 'ready_for_review' }));
    await processPullRequestEvent(event(ticket.key, { deliveryId: 'open-tie' }));
    await processPullRequestEvent(event(ticket.key, { deliveryId: 'open-older', sourceUpdatedAt: new Date('2026-09-28') }));
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'in_review', prStatus: 'open' });
    expect(await db.select().from(comments)).toHaveLength(1);
  });

  it('keeps two PR identities and completes only after all known open PRs are resolved', async () => {
    const { ticket } = await fixture();
    await processPullRequestEvent(event(ticket.key));
    const second = { number: 43, prUrl: `${repoUrl}/pull/43` };
    await processPullRequestEvent(event(ticket.key, { ...second, deliveryId: 'second-open' }));
    await processPullRequestEvent(event(ticket.key, { action: 'closed', merged: true, deliveryId: 'first-merge' }));
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'in_progress', prStatus: 'open', prUrl: second.prUrl });
    await processPullRequestEvent(event(ticket.key, { ...second, action: 'closed', merged: true, deliveryId: 'second-merge' }));
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'done', prStatus: 'merged' });
    expect(await db.select().from(ticketPullRequests)).toHaveLength(2);
  });

  it.each(['done', 'canceled'])('preserves manually terminal %s when another PR opens', async status => {
    const { ticket } = await fixture();
    await db.update(tickets).set({ status, prStatus: 'merged', prUrl: `${repoUrl}/pull/41` }).where(eq(tickets.id, ticket.id));
    await processPullRequestEvent(event(ticket.key));
    expect(await readTicket(ticket.id)).toMatchObject({ status, prStatus: 'merged', prUrl: `${repoUrl}/pull/41` });
  });

  it('retains ticket association when a later lifecycle event loses the ticket key', async () => {
    const { ticket } = await fixture();
    await processPullRequestEvent(event(ticket.key));
    await processPullRequestEvent(event('', { action: 'closed', merged: true, deliveryId: 'merge' }));
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'done', prStatus: 'merged' });
  });

  it('closes abandoned PRs without completing the ticket and permits a newer reopen', async () => {
    const { ticket } = await fixture();
    await processPullRequestEvent(event(ticket.key, { action: 'closed' }));
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'todo', prStatus: 'closed' });
    await processPullRequestEvent(event(ticket.key, { action: 'reopened', deliveryId: 'reopen', sourceUpdatedAt: new Date('2026-09-30') }));
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'in_progress', prStatus: 'open' });
  });

  it('cleans up dependencies on merge and returns effects for affected tickets', async () => {
    const { project, ticket } = await fixture();
    const other = await seedTicket(project.id, { id: 'ticket-2', key: `${project.key}-2` });
    await db.insert(ticketRelationships).values({ ticketId: ticket.id, blockedTicketId: other.id, projectId: project.id });
    const effects = await processPullRequestEvent(event(ticket.key, { action: 'closed', merged: true }));
    expect(effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: ticket.id, commentAdded: true }),
      expect.objectContaining({ ticketId: other.id, commentAdded: false }),
    ]));
    expect(await db.select().from(ticketRelationships)).toHaveLength(0);
  });

  it('restricts reconciliation to the explicitly reviewed ticket and records its approver', async () => {
    const { project, ticket } = await fixture();
    const other = await seedTicket(project.id, { id: 'ticket-2', key: `${project.key}-2` });
    await db.update(tickets).set({ updatedAt: new Date('2026-09-28') }).where(eq(tickets.id, ticket.id));
    const current = await readTicket(ticket.id);
    const input = event(other.key, { action: 'closed', merged: true, reconciliation: {
      projectId: project.id, ticketId: ticket.id, actorUserId: 'approver', reviewed: true, evidence: ['reviewed match'],
      mergedAt: new Date('2026-09-29'), expected: { ...current, updatedAt: current.updatedAt.toISOString() },
    } });
    await processPullRequestEvent(input);
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'done', prStatus: 'merged' });
    expect(await readTicket(other.id)).toMatchObject({ status: other.status, prStatus: 'none' });
    expect(await listComments(ticket.id)).toMatchObject([{ automation: {
      source: 'reconciliation', actorUserId: 'approver', evidence: ['reviewed match'],
      before: { status: 'todo' }, after: { status: 'done' },
    } }]);
    expect(await processPullRequestEvent({ ...input, deliveryId: 'retry-new-id' })).toEqual([]);
    expect(await db.select().from(comments)).toHaveLength(1);
  });

  it('rejects stale reconciliation snapshots before updating tickets', async () => {
    const { project, ticket } = await fixture();
    const current = await readTicket(ticket.id);
    await expect(processPullRequestEvent(event(ticket.key, { action: 'closed', merged: true, reconciliation: {
      projectId: project.id, ticketId: ticket.id, actorUserId: 'approver', reviewed: true, evidence: [],
      mergedAt: new Date('2030-01-01'), expected: { ...current, title: 'old title', updatedAt: current.updatedAt.toISOString() },
    } }))).rejects.toMatchObject({ code: 'stale' });
    expect(await readTicket(ticket.id)).toEqual(current);
    expect(await db.select().from(comments)).toHaveLength(0);
  });

  it('repairs restored ticket fields even when old PR state and delivery IDs survive', async () => {
    const { project, ticket } = await fixture();
    await processPullRequestEvent(event(ticket.key, { action: 'closed', merged: true }));
    await db.update(tickets).set({ status: 'todo', prStatus: 'none', prUrl: null, updatedAt: new Date('2026-09-28') }).where(eq(tickets.id, ticket.id));
    const restored = await readTicket(ticket.id);
    const input = event('', { action: 'closed', merged: true, reconciliation: {
      projectId: project.id, ticketId: ticket.id, actorUserId: 'approver', reviewed: true, evidence: [],
      mergedAt: new Date('2026-09-29'), expected: { ...restored, updatedAt: restored.updatedAt.toISOString() },
    } });
    expect(await processPullRequestEvent(input)).toHaveLength(1);
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'done', prStatus: 'merged', prUrl: input.prUrl });
    expect(await processPullRequestEvent(input)).toEqual([]);
  });

  it.each(['canceled', 'post-merge-edit', 'other-url', 'other-open-pr', 'reopened'])('protects reconciliation against %s', async reason => {
    const { project, ticket } = await fixture();
    if (reason === 'other-open-pr') await processPullRequestEvent(event(ticket.key, { number: 43, prUrl: `${repoUrl}/pull/43` }));
    await db.update(tickets).set({
      status: reason === 'canceled' ? 'canceled' : 'todo',
      prStatus: reason === 'reopened' ? 'merged' : 'none',
      prUrl: reason === 'other-url' ? `${repoUrl}/pull/44` : null,
      updatedAt: new Date(reason === 'post-merge-edit' ? '2026-09-30' : '2026-09-28'),
    }).where(eq(tickets.id, ticket.id));
    const current = await readTicket(ticket.id);
    await expect(processPullRequestEvent(event(ticket.key, { action: 'closed', merged: true, reconciliation: {
      projectId: project.id, ticketId: ticket.id, actorUserId: 'approver', reviewed: true, evidence: [],
      mergedAt: new Date('2026-09-29'), expected: { ...current, updatedAt: current.updatedAt.toISOString() },
    } }))).rejects.toMatchObject({ code: 'protected' });
    expect(await readTicket(ticket.id)).toEqual(current);
  });

  it('matches configured repository URLs with case, .git and trailing slash variations', async () => {
    const { project, ticket } = await fixture();
    await db.update(projects).set({ githubRepoUrl: 'https://github.com/Test/Repo.git/' }).where(eq(projects.id, project.id));
    expect(await processPullRequestEvent(event(ticket.key))).toHaveLength(1);
  });

  it.each([
    ['https://github.com/Test/Repo/pull/42/', 'https://github.com/test/repo/pull/42'],
    ['https://github.com/test/repo/pull/42', 'https://github.com/test/repo/pull/42'],
    ['https://github.com/test/repo/issues/42', null],
    ['https://github.com/test/repo/pull/0', null],
    ['https://github.com/test/repo/pull/42?query=true', null],
    ['https://github.com.evil.test/test/repo/pull/42', null],
  ])('canonicalizes PR identity %s', (value, expected) => {
    expect(normalizeGitHubPullRequestUrl(value)).toBe(expected);
  });

  it('merges a mixed-case legacy link without creating a phantom open PR', async () => {
    const { ticket } = await fixture();
    await db.update(tickets).set({ status: 'in_progress', prStatus: 'open', prUrl: 'https://github.com/Test/Repo/pull/42/' }).where(eq(tickets.id, ticket.id));
    await processPullRequestEvent(event(ticket.key, { action: 'closed', merged: true }));
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'done', prStatus: 'merged', prUrl: `${repoUrl}/pull/42` });
    expect(await db.select().from(ticketPullRequests)).toHaveLength(1);
  });

  it('accepts a canonical-equivalent link for reconciliation while checking the raw snapshot', async () => {
    const { project, ticket } = await fixture();
    await db.update(tickets).set({ prStatus: 'open', prUrl: 'https://github.com/Test/Repo/pull/42/', updatedAt: new Date('2026-09-28') }).where(eq(tickets.id, ticket.id));
    const current = await readTicket(ticket.id);
    const input = event('', { action: 'closed', merged: true, reconciliation: {
      projectId: project.id, ticketId: ticket.id, actorUserId: 'approver', reviewed: true, evidence: [],
      mergedAt: new Date('2026-09-29'), expected: { ...current, updatedAt: current.updatedAt.toISOString() },
    } });
    expect(await processPullRequestEvent(input)).toHaveLength(1);
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'done', prStatus: 'merged', prUrl: input.prUrl });
    await db.update(tickets).set({ prUrl: 'https://github.com/Test/Repo/pull/42/' }).where(eq(tickets.id, ticket.id));
    expect(await processPullRequestEvent(input)).toEqual([]);
    expect(await db.select().from(comments)).toHaveLength(1);
  });

  it.each(['closed', 'ready_for_review'])('rejects stale new ticket associations after a newer %s snapshot', async action => {
    const { project, ticket } = await fixture();
    const other = await seedTicket(project.id, { id: 'ticket-2', key: `${project.key}-2`, status: 'todo' });
    await processPullRequestEvent(event(ticket.key, { action, merged: action === 'closed' }));
    expect(await processPullRequestEvent(event(other.key, { deliveryId: 'delayed-open', sourceUpdatedAt: new Date('2026-09-28') }))).toEqual([]);
    expect(await readTicket(other.id)).toMatchObject({ status: 'todo', prStatus: 'none' });
    expect(await db.select().from(ticketPullRequests)).toHaveLength(1);
  });

  it('retains PR-wide ordering even when the newest snapshot has no ticket key', async () => {
    const { ticket } = await fixture();
    await processPullRequestEvent(event('', { action: 'closed', merged: true }));
    expect(await db.select().from(githubPullRequests)).toHaveLength(1);
    expect(await processPullRequestEvent(event(ticket.key, { deliveryId: 'delayed-open', sourceUpdatedAt: new Date('2026-09-28') }))).toEqual([]);
    expect(await readTicket(ticket.id)).toMatchObject({ status: 'todo', prStatus: 'none' });
    expect(await db.select().from(comments)).toHaveLength(0);
  });

  it('acknowledges unsupported HTTP actions and requires identity/timestamps for supported ones', async () => {
    const app = createApp();
    for (const action of ['edited', 'synchronize', 'labeled']) {
      const result = await request(app).post('/api/v1/webhooks/github').set('x-github-event', 'pull_request').send({ action });
      expect(result.status).toBe(200);
    }
    const invalid = await request(app).post('/api/v1/webhooks/github').set('x-github-event', 'pull_request').send({ action: 'opened', pull_request: {} });
    expect(invalid.status).toBe(400);
  });
});
