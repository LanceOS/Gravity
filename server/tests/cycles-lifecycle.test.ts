import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { cycles, projects, teams, tickets, workspaceMembers } from '../src/db/schema.js';
import { getDefaultTeamId } from '../src/modules/workspaces/utils/default-team.js';
import { getProjectTeamId } from '../src/modules/workspaces/services/membership.js';
import { createCycleRecord } from '../src/modules/tickets/services/cycles.js';
import { createAuthenticatedApi, seedTicket, seedWorkspaceFixture } from './helpers/test-helpers.js';

const base = { startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-06-08T00:00:00.000Z' };

async function fixture() {
  const ownerApi = await createAuthenticatedApi({ name: 'Cycle Owner', email: 'cycle-owner@example.com', role: 'owner' });
  const { workspace, project } = await seedWorkspaceFixture({ owner: {
    id: ownerApi.user.id, name: ownerApi.user.name, email: ownerApi.user.email,
    role: 'owner', avatarUrl: ownerApi.user.avatar,
  } });
  return { ownerApi, workspace, project, teamId: getDefaultTeamId(workspace.id) };
}

describe('cycle lifecycle', () => {
  it('validates names and real date ranges before persistence', async () => {
    const { ownerApi, teamId } = await fixture();
    for (const payload of [
      { name: '   ', ...base },
      { name: 'Bad day', startDate: '2026-02-30', endDate: '2026-03-05' },
      { name: 'Bad timestamp', startDate: '2026-06-01T25:00:00Z', endDate: base.endDate },
      { name: 'No offset', startDate: '2026-06-01T00:00:00', endDate: base.endDate },
      { name: 'Reversed', startDate: base.endDate, endDate: base.startDate },
    ]) {
      expect((await ownerApi.post('/api/v1/cycles').send({ teamId, ...payload })).status).toBe(400);
    }
    expect(await db.select().from(cycles)).toEqual([]);
  });

  it('enforces active half-open intervals and reopening', async () => {
    const { ownerApi, teamId } = await fixture();
    // pg-mem does not enforce FOR UPDATE. Exercise the overlap rule here;
    // concurrent lock behavior needs a native PostgreSQL regression.
    const first = await ownerApi.post('/api/v1/cycles').send({ teamId, name: 'One', ...base });
    const second = await ownerApi.post('/api/v1/cycles').send({ teamId, name: 'Two', ...base });
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect((await db.select().from(cycles).where(eq(cycles.teamId, teamId))).map(cycle => cycle.name)).toEqual(['One']);
    const active = first.body;
    const adjacent = await ownerApi.post('/api/v1/cycles').send({
      teamId, name: 'Adjacent', startDate: base.endDate, endDate: '2026-06-15T00:00:00.000Z',
    });
    expect(adjacent.status).toBe(201);
    const completed = await ownerApi.post('/api/v1/cycles').send({ teamId, name: 'Historical', ...base, completed: true });
    expect(completed.status).toBe(201);
    expect((await ownerApi.get(`/api/v1/cycles/${completed.body.id}`)).body.completed).toBe(1);
    expect((await ownerApi.post(`/api/v1/cycles/${completed.body.id}/reopen`)).status).toBe(409);
    expect((await ownerApi.post(`/api/v1/cycles/${active.id}/complete`)).status).toBe(200);
    expect((await ownerApi.post(`/api/v1/cycles/${completed.body.id}/reopen`)).status).toBe(200);
    expect((await ownerApi.patch(`/api/v1/cycles/${adjacent.body.id}`).send({ startDate: base.startDate })).status).toBe(409);
    const future = { startDate: '2026-07-01', endDate: '2026-07-08' };
    const [archiveA, archiveB] = await Promise.all([
      ownerApi.post('/api/v1/cycles').send({ teamId, name: 'Archive A', ...future, completed: true }),
      ownerApi.post('/api/v1/cycles').send({ teamId, name: 'Archive B', ...future, completed: true }),
    ]);
    expect([archiveA.status, archiveB.status]).toEqual([201, 201]);
    expect((await ownerApi.post(`/api/v1/cycles/${archiveA.body.id}/reopen`)).status).toBe(200);
    expect((await ownerApi.post(`/api/v1/cycles/${archiveB.body.id}/reopen`)).status).toBe(409);
  });

  it('keeps cycles within their team and limits writes to workspace owners', async () => {
    const { ownerApi, workspace, project, teamId } = await fixture();
    const memberApi = await createAuthenticatedApi({ name: 'Cycle Member', email: 'cycle-member@example.com' });
    const adminApi = await createAuthenticatedApi({ name: 'Cycle Admin', email: 'cycle-admin@example.com' });
    const outsiderApi = await createAuthenticatedApi({ name: 'Cycle Outsider', email: 'cycle-outsider@example.com' });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: memberApi.user.id, role: 'member' });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: adminApi.user.id, role: 'admin' });
    await db.insert(teams).values({ id: 'other-cycle-team', workspaceId: workspace.id, name: 'Other' });
    const cycle = await ownerApi.post('/api/v1/cycles').send({ teamId, name: '  First  ', ...base });
    expect(cycle.status).toBe(201);
    expect(cycle.body.name).toBe('First');
    expect((await memberApi.get(`/api/v1/cycles/${cycle.body.id}`)).status).toBe(200);
    expect((await memberApi.patch(`/api/v1/cycles/${cycle.body.id}`).send({ name: 'Changed' })).status).toBe(403);
    expect((await memberApi.post(`/api/v1/cycles/${cycle.body.id}/complete`)).status).toBe(403);
    expect((await memberApi.delete(`/api/v1/cycles/${cycle.body.id}`)).status).toBe(403);
    expect((await memberApi.post('/api/v1/cycles').send({ teamId, name: 'No', ...base })).status).toBe(403);
    expect((await adminApi.post('/api/v1/cycles').send({ teamId, name: 'No', ...base })).status).toBe(403);
    expect((await adminApi.post(`/api/v1/cycles/${cycle.body.id}/complete`)).status).toBe(403);
    expect((await outsiderApi.get(`/api/v1/cycles/${cycle.body.id}`)).status).toBe(403);
    expect((await outsiderApi.patch(`/api/v1/cycles/${cycle.body.id}`).send({ name: 'No' })).status).toBe(403);
    expect((await ownerApi.get(`/api/v1/cycles/${cycle.body.id}`).query({ teamId: 'wrong-team' })).status).toBe(404);
    expect((await ownerApi.patch(`/api/v1/cycles/${cycle.body.id}`).send({ teamId: 'wrong-team' })).status).toBe(400);
    expect((await ownerApi.post('/api/v1/cycles').send({
      teamId: 'other-cycle-team', projectId: project.id, name: 'Wrong team', ...base,
    })).status).toBe(400);
    expect((await ownerApi.get('/api/v1/cycles').query({ teamId: 'other-cycle-team', projectId: project.id })).status).toBe(400);
  });

  it('rejects deletion with assigned tickets and deletes only after references are cleared', async () => {
    const { ownerApi, workspace, project, teamId } = await fixture();
    const sidebarCycles = async () => {
      const response = await ownerApi.get(`/api/v1/workspaces/${workspace.id}/sidebar`);
      expect(response.status).toBe(200);
      return response.body.teams.find((team: { id: string }) => team.id === teamId)?.cycles;
    };
    expect(await sidebarCycles()).toEqual([]);
    const created = await ownerApi.post('/api/v1/cycles').send({ teamId, name: 'Planned', ...base });
    expect(created.status).toBe(201);
    expect(await sidebarCycles()).toEqual([expect.objectContaining({ id: created.body.id, name: 'Planned' })]);
    expect((await ownerApi.patch(`/api/v1/cycles/${created.body.id}`).send({ name: 'Renamed' })).status).toBe(200);
    expect(await sidebarCycles()).toEqual([expect.objectContaining({ id: created.body.id, name: 'Renamed' })]);
    const ticket = await seedTicket(project.id, { cycleId: created.body.id });
    expect((await ownerApi.delete(`/api/v1/cycles/${created.body.id}`)).status).toBe(409);
    await expect(db.delete(cycles).where(eq(cycles.id, created.body.id))).rejects.toThrow();
    await expect(db.update(tickets).set({ cycleId: 'missing-cycle' }).where(eq(tickets.id, ticket.id))).rejects.toThrow();
    expect((await db.select().from(tickets).where(eq(tickets.id, ticket.id)))[0]?.cycleId).toBe(created.body.id);
    await db.update(tickets).set({ cycleId: null }).where(eq(tickets.id, ticket.id));
    expect((await ownerApi.delete(`/api/v1/cycles/${created.body.id}`)).status).toBe(200);
    expect(await sidebarCycles()).toEqual([]);
    expect(await db.select().from(cycles).where(eq(cycles.id, created.body.id))).toEqual([]);
    expect((await db.select().from(tickets).where(eq(tickets.id, ticket.id)))[0]?.cycleId).toBeNull();
  });

  it('rejects a team transfer that would overlap active cycles', async () => {
    const { ownerApi, workspace, project, teamId } = await fixture();
    const targetTeamId = 'cycle-transfer-target';
    await db.insert(teams).values({ id: targetTeamId, workspaceId: workspace.id, name: 'Target' });
    expect((await ownerApi.post('/api/v1/cycles').send({ teamId, name: 'Source', ...base })).status).toBe(201);
    expect((await ownerApi.post('/api/v1/cycles').send({ teamId: targetTeamId, name: 'Target', ...base })).status).toBe(201);
    const transfer = await ownerApi.delete(`/api/v1/teams/${teamId}`).query({ reassignTeamId: targetTeamId });
    expect(transfer.status).toBe(409);
    expect((await db.select().from(projects).where(eq(projects.id, project.id)))[0]?.teamId).toBe(teamId);
    expect((await db.select().from(cycles).where(eq(cycles.teamId, teamId))).length).toBe(1);
  });

  it('rechecks a project team inside cycle creation after a stale caller lookup', async () => {
    const { ownerApi, workspace, project, teamId } = await fixture();
    expect(await getProjectTeamId(project.id)).toBe(teamId);
    await db.insert(teams).values({ id: 'new-cycle-team', workspaceId: workspace.id, name: 'New team' });
    await db.update(projects).set({ teamId: 'new-cycle-team' }).where(eq(projects.id, project.id));
    await expect(createCycleRecord(teamId, { projectId: project.id, name: 'Stale', ...base }, project.id))
      .rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(cycles)).toEqual([]);
    const current = await ownerApi.post('/api/v1/cycles').send({ projectId: project.id, name: 'Current', ...base });
    expect(current.status).toBe(201);
  });
});
