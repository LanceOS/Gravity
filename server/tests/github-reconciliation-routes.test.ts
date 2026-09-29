import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { comments, projects, tickets, ticketRelationships } from '../src/db/schema.js';
import { api, createAuthenticatedApi, seedTicket, seedWorkspaceFixture } from './helpers/test-helpers.js';

async function fixture() {
  const ownerApi = await createAuthenticatedApi({ name: 'Reconcile Owner', email: 'reconcile@example.com' });
  const { project, owner } = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id, name: ownerApi.user.name, email: ownerApi.user.email } });
  await db.update(projects).set({ githubRepoUrl: 'https://github.com/Owner/repo.git/' }).where(eq(projects.id, project.id));
  const ticket = await seedTicket(project.id, { id: 'reconcile-one', key: `${project.key}-1`, title: 'Recover missing ticket updates' });
  await db.update(tickets).set({ updatedAt: new Date('2026-01-01') }).where(eq(tickets.id, ticket.id));
  const pr = { number: 1, title: `${ticket.key} Recover missing ticket updates`, head: { ref: 'fix/recover' }, state: 'closed', merged_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify([pr])));
  vi.stubGlobal('fetch', fetchMock);
  const base = `/api/v1/projects/${project.id}/github-reconciliation`;
  return { ownerApi, owner, project, ticket, pr, fetchMock, base };
}
async function current(id: string) { return (await db.select().from(tickets).where(eq(tickets.id, id)))[0]; }

describe('project reconciliation API', () => {
  it('previews without mutation, applies selected evidence, records activity and reruns idempotently', async () => {
    const { ownerApi, owner, project, ticket, base } = await fixture();
    const dependent = await seedTicket(project.id, { id: 'dependent', key: `${project.key}-2`, title: 'Another task' });
    await db.insert(ticketRelationships).values({ ticketId: ticket.id, blockedTicketId: dependent.id, projectId: project.id });
    const before = await current(ticket.id);
    const preview = await ownerApi.post(`${base}/preview`).send({});
    expect(preview.status).toBe(200);
    expect(preview.body.candidates).toHaveLength(1);
    expect(preview.body.candidates[0]).toMatchObject({ protected: false, confidence: 'explicit', proposed: { status: 'done', prStatus: 'merged' } });
    expect(await current(ticket.id)).toEqual(before);
    expect(await db.select().from(comments)).toHaveLength(0);
    const body = { previewToken: preview.body.previewToken, selections: [{ candidateId: preview.body.candidates[0].id }] };
    const applied = await ownerApi.post(`${base}/apply`).send(body);
    expect(applied.status).toBe(200);
    expect(applied.body.results[0].outcome).toBe('applied');
    expect(await current(ticket.id)).toMatchObject({ status: 'done', prStatus: 'merged', prUrl: 'https://github.com/owner/repo/pull/1' });
    const activity = await db.select().from(comments).where(eq(comments.ticketId, ticket.id));
    expect(activity).toHaveLength(1);
    expect(activity[0].automation).toMatchObject({ source: 'reconciliation', actorUserId: owner.id,
      before: { status: 'todo' }, after: { status: 'done' }, evidence: ['Ticket key in PR title'] });
    expect(await db.select().from(ticketRelationships)).toHaveLength(0);
    const repeated = await ownerApi.post(`${base}/apply`).send(body);
    expect(repeated.body.results[0].outcome).toBe('unchanged');
    expect(await db.select().from(comments)).toHaveLength(1);
    // Simulate a restored ticket while the PR identity/activity survived.
    await db.update(tickets).set({ status: 'todo', prStatus: 'none', prUrl: null, updatedAt: new Date('2026-01-01') }).where(eq(tickets.id, ticket.id));
    const restored = await ownerApi.post(`${base}/preview`).send({});
    const rerun = await ownerApi.post(`${base}/apply`).send({ ...body, previewToken: restored.body.previewToken });
    expect(rerun.body.results[0].outcome).toBe('applied');
    expect((await current(ticket.id)).status).toBe('done');
  });
  it('reconciles an equivalent legacy PR link without treating casing as a manual override', async () => {
    const { ownerApi, base, ticket } = await fixture();
    await db.update(tickets).set({ prUrl: 'https://github.com/OWNER/Repo/pull/1/', prStatus: 'open' }).where(eq(tickets.id, ticket.id));
    const preview = await ownerApi.post(`${base}/preview`).send({});
    expect(preview.body.candidates[0].protected).toBe(false);
    const applied = await ownerApi.post(`${base}/apply`).send({ previewToken: preview.body.previewToken, selections: [{ candidateId: preview.body.candidates[0].id }] });
    expect(applied.body.results[0].outcome).toBe('applied');
    expect(await current(ticket.id)).toMatchObject({ status: 'done', prStatus: 'merged', prUrl: 'https://github.com/owner/repo/pull/1' });
  });
  it('rejects unauthenticated and cross-workspace callers before GitHub access', async () => {
    const { base, fetchMock } = await fixture();
    expect((await api().post(`${base}/preview`).send({})).status).toBe(401);
    const outsider = await createAuthenticatedApi({ name: 'Outsider', email: 'outside@example.com' });
    expect((await outsider.post(`${base}/preview`).send({})).status).toBe(403);
    expect((await outsider.post(`${base}/apply`).send({})).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects tampering, unknown matches and duplicate ticket selections', async () => {
    const { ownerApi, base } = await fixture();
    const preview = await ownerApi.post(`${base}/preview`).send({});
    const candidateId = preview.body.candidates[0].id;
    expect((await ownerApi.post(`${base}/apply`).send({ previewToken: `x${preview.body.previewToken}`, selections: [{ candidateId }] })).status).toBe(409);
    expect((await ownerApi.post(`${base}/apply`).send({ previewToken: preview.body.previewToken, selections: [{ candidateId: 'invented' }] })).status).toBe(400);
    expect((await ownerApi.post(`${base}/apply`).send({ previewToken: preview.body.previewToken, selections: [{ candidateId }, { candidateId }] })).status).toBe(400);
    expect(await db.select().from(comments)).toHaveLength(0);
  });
  it('rejects changed GitHub evidence and preserves edits made since preview', async () => {
    const { ownerApi, base, ticket, pr, fetchMock } = await fixture();
    const preview = await ownerApi.post(`${base}/preview`).send({});
    const body = { previewToken: preview.body.previewToken, selections: [{ candidateId: preview.body.candidates[0].id }] };
    fetchMock.mockImplementation(async () => new Response(JSON.stringify([{ ...pr, title: 'Changed PR title' }])));
    expect((await ownerApi.post(`${base}/apply`).send(body)).status).toBe(409);
    fetchMock.mockImplementation(async () => new Response(JSON.stringify([pr])));
    await db.update(tickets).set({ status: 'canceled', updatedAt: new Date() }).where(eq(tickets.id, ticket.id));
    const applied = await ownerApi.post(`${base}/apply`).send(body);
    expect(applied.body.results[0].outcome).toBe('stale');
    expect((await current(ticket.id)).status).toBe('canceled');
    expect(await db.select().from(comments)).toHaveLength(0);
  });
  it('requires review for semantic suggestions and applies only the selected ticket', async () => {
    const { ownerApi, base, ticket, pr, project, fetchMock } = await fixture();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify([{ ...pr, title: 'Recover missing ticket updates' }])));
    await seedTicket(project.id, { id: 'unselected', key: `${project.key}-2`, title: 'Recover missing ticket updates' });
    await db.update(tickets).set({ updatedAt: new Date('2026-01-01') }).where(eq(tickets.id, 'unselected'));
    const preview = await ownerApi.post(`${base}/preview`).send({});
    const candidate = preview.body.candidates.find((item: { ticketId: string }) => item.ticketId === ticket.id);
    expect(candidate).toMatchObject({ confidence: 'suggested', requiresReview: true });
    const body = { previewToken: preview.body.previewToken, selections: [{ candidateId: candidate.id, reviewed: false }] };
    expect((await ownerApi.post(`${base}/apply`).send(body)).status).toBe(400);
    body.selections[0].reviewed = true;
    expect((await ownerApi.post(`${base}/apply`).send(body)).body.results[0].outcome).toBe('applied');
    expect((await current('unselected')).status).toBe('todo');
  });
  it('never applies protected matches even when reviewed', async () => {
    const { ownerApi, base, ticket } = await fixture();
    await db.update(tickets).set({ status: 'canceled' }).where(eq(tickets.id, ticket.id));
    const preview = await ownerApi.post(`${base}/preview`).send({});
    expect(preview.body.candidates[0].protected).toBe(true);
    const result = await ownerApi.post(`${base}/apply`).send({ previewToken: preview.body.previewToken, selections: [{ candidateId: preview.body.candidates[0].id, reviewed: true }] });
    expect(result.status).toBe(400);
    expect((await current(ticket.id)).status).toBe('canceled');
  });
  it('bounds scan inputs and fails without mutations on rate limits', async () => {
    const { ownerApi, base, fetchMock } = await fixture();
    expect((await ownerApi.post(`${base}/preview`).send({ maxPages: 6 })).status).toBe(400);
    expect((await ownerApi.post(`${base}/preview`).send({ credential: 'ghp_full_access' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => new Response('private details', { status: 429 }));
    const response = await ownerApi.post(`${base}/preview`).send({});
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('private details');
    expect(await db.select().from(comments)).toHaveLength(0);
  });
});
