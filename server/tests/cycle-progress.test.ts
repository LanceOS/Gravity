import { describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { cycleProgressDailyDeltas, cycleProgressEvents, cycles, projects, teams, workspaceMembers, workspaces } from '../src/db/schema.js';
import { createTicketRecord, deleteTicketRecord, updateTicketRecord } from '../src/modules/tickets/services/tickets.js';
import { getDefaultTeamId } from '../src/modules/workspaces/utils/default-team.js';
import { deleteProjectRecord, updateProjectRecord } from '../src/modules/workspaces/services/projects.js';
import { createAuthenticatedApi, seedTicket, seedWorkspaceFixture } from './helpers/test-helpers.js';

function range() {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 2));
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

async function fixture() {
  const ownerApi = await createAuthenticatedApi({ email: 'progress-owner@example.com', role: 'owner' });
  const { workspace, project } = await seedWorkspaceFixture({ owner: {
    id: ownerApi.user.id, email: ownerApi.user.email, name: ownerApi.user.name, role: 'owner', avatarUrl: ownerApi.user.avatar,
  } });
  const teamId = getDefaultTeamId(workspace.id);
  const response = await ownerApi.post('/api/v1/cycles').send({ teamId, name: 'Progress', ...range() });
  expect(response.status).toBe(201);
  return { ownerApi, workspace, project, teamId, cycleId: response.body.id as string };
}

describe('cycle progress', () => {
  it('counts tickets across team projects and records additions, reopenings, exits and idempotent writes', async () => {
    const { ownerApi, workspace, project, teamId, cycleId } = await fixture();
    await db.insert(projects).values({
      id: 'progress-second-project', workspaceId: workspace.id, teamId, name: 'Second', key: 'SEC',
      status: 'active', inviteCode: 'INV-SEC-0001', createdBy: ownerApi.user.id,
    });
    const first = await createTicketRecord({ projectId: project.id, title: 'First', cycleId, status: 'todo' });
    const second = await createTicketRecord({ projectId: 'progress-second-project', title: 'Second', cycleId, status: 'done' });
    const read = async () => (await ownerApi.get(`/api/v1/cycles/${cycleId}/progress`)).body;
    expect((await read()).summary).toMatchObject({ total: 2, completed: 1, remaining: 1,
      statusBreakdown: { todo: 1, done: 1 } });
    await updateTicketRecord(first.id, { status: 'done' });
    expect((await read()).summary).toMatchObject({ total: 2, completed: 2, remaining: 0 });
    await updateTicketRecord(first.id, { status: 'todo' });
    await updateTicketRecord(first.id, { status: 'todo' });
    expect((await db.select().from(cycleProgressEvents).where(eq(cycleProgressEvents.ticketId, first.id))).length).toBe(3);
    await updateTicketRecord(second.id, { cycleId: null });
    expect((await read()).summary).toMatchObject({ total: 1, completed: 0, remaining: 1 });
    await updateTicketRecord(second.id, { cycleId });
    await deleteTicketRecord(first.id);
    const progress = await read();
    expect(progress.summary).toMatchObject({ total: 1, completed: 1, remaining: 0 });
    expect(progress.dailyRemaining.at(-1)).toMatchObject({ total: 1, completed: 1, remaining: 0 });
    expect(progress.historyAvailableFrom).toEqual(expect.any(String));
    expect(progress.historyUnavailableBefore).toBe(true);
    expect((await ownerApi.post(`/api/v1/cycles/${cycleId}/complete`)).status).toBe(200);
    expect(await read()).toEqual(progress);
  });

  it('authorizes progress through the team and reports preexisting history as unavailable', async () => {
    const { ownerApi, workspace, project, teamId, cycleId } = await fixture();
    const memberApi = await createAuthenticatedApi({ email: 'progress-member@example.com' });
    const outsiderApi = await createAuthenticatedApi({ email: 'progress-outsider@example.com' });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: memberApi.user.id, role: 'member' });
    expect((await memberApi.get(`/api/v1/cycles/${cycleId}/progress`)).status).toBe(200);
    expect((await outsiderApi.get(`/api/v1/cycles/${cycleId}/progress`)).status).toBe(403);
    expect((await ownerApi.get(`/api/v1/cycles/${cycleId}/progress`).query({ teamId: 'another-team' })).status).toBe(404);

    await db.insert(teams).values({ id: 'unrelated-progress-team', workspaceId: workspace.id, name: 'Other team' });
    await db.insert(projects).values({ id: 'unrelated-progress-project', workspaceId: workspace.id,
      teamId: 'unrelated-progress-team', name: 'Other project', key: 'OTH', status: 'active',
      inviteCode: 'INV-OTH-0001', createdBy: ownerApi.user.id });
    await seedTicket('unrelated-progress-project', { id: 'rogue-progress-ticket', key: 'OTH-901', cycleId });
    await db.insert(workspaces).values({ id: 'unrelated-progress-workspace', name: 'Other workspace', key: 'OTHER',
      workspaceKey: 'other', createdBy: ownerApi.user.id });
    await db.insert(projects).values({ id: 'cross-workspace-progress-project', workspaceId: 'unrelated-progress-workspace',
      teamId, name: 'Cross workspace', key: 'CROSS', status: 'active',
      inviteCode: 'INV-CROSS-0001', createdBy: ownerApi.user.id });
    await seedTicket('cross-workspace-progress-project', { id: 'cross-workspace-progress-ticket', key: 'CROSS-901', cycleId });
    await expect(createTicketRecord({ projectId: 'cross-workspace-progress-project', title: 'Rejected', cycleId }))
      .rejects.toThrow('TICKET_CYCLE_SCOPE_VIOLATION');
    expect((await ownerApi.get(`/api/v1/cycles/${cycleId}/progress`)).body.summary.total).toBe(0);

    await db.insert(cycles).values({ id: 'legacy-progress-cycle', teamId, name: 'Legacy',
      startDate: new Date(range().startDate), endDate: new Date(range().endDate) });
    const ticket = await seedTicket(project.id, { id: 'legacy-progress-ticket', key: 'GRV-901', cycleId: 'legacy-progress-cycle' });
    const url = '/api/v1/cycles/legacy-progress-cycle/progress';
    expect((await ownerApi.get(url)).body).toMatchObject({
      summary: { total: 1, completed: 0, remaining: 1 },
      historyAvailableFrom: null, historyUnavailableBefore: true, dailyRemaining: [],
    });
    await updateTicketRecord(ticket.id, { status: 'done' });
    const progress = (await ownerApi.get(url)).body;
    expect(progress.historyAvailableFrom).toEqual(expect.any(String));
    expect(progress.historyUnavailableBefore).toBe(true);
    expect(progress.summary).toMatchObject({ total: 1, completed: 1, remaining: 0 });
    expect((await db.select().from(cycleProgressEvents).where(eq(cycleProgressEvents.cycleId, 'legacy-progress-cycle'))).map(row => row.status))
      .toEqual(['todo', 'done']);
  });

  it('uses UTC half-open day boundaries and keeps earlier daily points stable', async () => {
    const { ownerApi, project, cycleId } = await fixture();
    const ticket = await createTicketRecord({ projectId: project.id, title: 'Boundary', cycleId });
    await updateTicketRecord(ticket.id, { status: 'done' });
    await updateTicketRecord(ticket.id, { status: 'todo' });
    const events = await db.select().from(cycleProgressEvents)
      .where(eq(cycleProgressEvents.cycleId, cycleId)).orderBy(asc(cycleProgressEvents.id));
    expect(events.map(event => event.status)).toEqual(['todo', 'done', 'todo']);
    const times = ['2026-06-01T12:00:00Z', '2026-06-02T00:00:00Z', '2026-06-03T13:00:00Z'];
    for (let i = 0; i < events.length; i++) {
      await db.update(cycleProgressEvents).set({ recordedAt: new Date(times[i]) }).where(eq(cycleProgressEvents.id, events[i].id));
    }
    await db.delete(cycleProgressDailyDeltas).where(eq(cycleProgressDailyDeltas.cycleId, cycleId));
    await db.insert(cycleProgressDailyDeltas).values([
      { cycleId, day: '2026-06-01', deltaTotal: 1, deltaCompleted: 0 },
      { cycleId, day: '2026-06-02', deltaTotal: 0, deltaCompleted: 1 },
      { cycleId, day: '2026-06-03', deltaTotal: 0, deltaCompleted: -1 },
    ]);
    await db.update(cycles).set({ startDate: new Date('2026-06-01T00:00:00Z'),
      endDate: new Date('2026-06-04T00:00:00Z'), progressTrackedAt: new Date('2026-06-01T00:00:00Z') })
      .where(eq(cycles.id, cycleId));
    const progress = (await ownerApi.get(`/api/v1/cycles/${cycleId}/progress`)).body;
    expect(progress.dailyRemaining.map((point: { date: string; remaining: number }) => [point.date, point.remaining]))
      .toEqual([['2026-06-01', 1], ['2026-06-02', 0], ['2026-06-03', 1]]);
    expect(progress.historyUnavailableBefore).toBe(false);
    await db.update(cycles).set({ endDate: new Date('2026-06-03T12:00:00Z') }).where(eq(cycles.id, cycleId));
    const partial = (await ownerApi.get(`/api/v1/cycles/${cycleId}/progress`)).body;
    expect(partial.dailyRemaining.map((point: { remaining: number }) => point.remaining)).toEqual([1, 0, 0]);
    expect(partial.summary.remaining).toBe(1);
  });

  it('baselines a legacy cycle before a project leaves its team', async () => {
    const { ownerApi, workspace, project, teamId } = await fixture();
    await db.insert(cycles).values({ id: 'legacy-move-cycle', teamId, name: 'Before move',
      startDate: new Date(range().startDate), endDate: new Date(range().endDate), completed: true });
    await seedTicket(project.id, { id: 'legacy-move-ticket', key: 'GRV-902', cycleId: 'legacy-move-cycle' });
    await db.insert(teams).values({ id: 'move-target-team', workspaceId: workspace.id, name: 'Move target' });
    await updateProjectRecord(project.id, { teamId: 'move-target-team' });
    const events = await db.select().from(cycleProgressEvents)
      .where(eq(cycleProgressEvents.cycleId, 'legacy-move-cycle')).orderBy(asc(cycleProgressEvents.id));
    expect(events.map(event => [event.status, event.deltaTotal])).toEqual([['todo', 1], [null, -1]]);
    const progress = (await ownerApi.get('/api/v1/cycles/legacy-move-cycle/progress')).body;
    expect(progress.summary.total).toBe(0);
    expect(progress.dailyRemaining.at(-1)).toMatchObject({ total: 0, remaining: 0 });
  });

  it('keeps exit history when a project is deleted', async () => {
    const { ownerApi, workspace, project, cycleId } = await fixture();
    const ticket = await createTicketRecord({ projectId: project.id, title: 'Deleted project task', cycleId });
    await deleteProjectRecord(project.id, workspace.id);
    const events = await db.select().from(cycleProgressEvents)
      .where(eq(cycleProgressEvents.ticketId, ticket.id)).orderBy(asc(cycleProgressEvents.id));
    expect(events.map(event => event.deltaTotal)).toEqual([1, -1]);
    const progress = (await ownerApi.get(`/api/v1/cycles/${cycleId}/progress`)).body;
    expect(progress.summary.total).toBe(0);
    expect(progress.dailyRemaining.at(-1)).toMatchObject({ total: 0, remaining: 0 });
  });
});
