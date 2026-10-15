import { describe, expect, it, vi } from 'vitest';
import * as realtime from '../src/realtime.js';
import { eq } from 'drizzle-orm';
import { createAuthenticatedApi, seedTicket, seedUser, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { labels, projectMembers, ticketLabels, tickets, workspaceMembers, workspaceSettings } from '../src/db/schema.js';
import { getDefaultTeamId } from '../src/modules/workspaces/utils/default-team.js';

describe('bulk ticket triage', () => {
  it('reports stale and foreign workspace tickets individually while saving authorized tickets', async () => {
    const actor = await createAuthenticatedApi({ email: 'bulk-owner@example.com', role: 'owner' });
    const local = await seedWorkspaceFixture({
      owner: { id: actor.user.id, email: actor.user.email, name: actor.user.name, role: 'owner' },
    });
    const foreign = await seedWorkspaceFixture({
      owner: { id: 'foreign-owner', email: 'foreign-owner@example.com', role: 'owner' },
      workspace: { id: 'foreign-workspace', key: 'FOR', workspaceKey: 'WS-FOR-123456' },
      project: { id: 'foreign-project', key: 'FOR', inviteCode: 'INV-FOR-0001ABCD' },
    });
    const valid = await seedTicket(local.project.id, { id: 'bulk-valid', key: 'GRV-1' });
    const stale = await seedTicket(local.project.id, { id: 'bulk-stale', key: 'GRV-2' });
    const outsider = await seedTicket(foreign.project.id, { id: 'bulk-foreign', key: 'FOR-1' });
    const [validRow, staleRow, foreignRow] = await Promise.all([valid, stale, outsider].map(async (ticket) => {
      const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
      return row;
    }));

    const broadcast = vi.spyOn(realtime, 'broadcastToWorkspace');

    const response = await actor.post('/api/v1/tickets/bulk-triage').send({
      workspaceId: local.workspace.id,
      tickets: [
        { id: valid.id, projectId: local.project.id, updatedAt: validRow.updatedAt.toISOString() },
        { id: stale.id, projectId: local.project.id, updatedAt: new Date(0).toISOString() },
        { id: outsider.id, projectId: foreign.project.id, updatedAt: foreignRow.updatedAt.toISOString() },
      ],
      action: { type: 'priority', value: 'urgent' },
    });
    expect(response.status).toBe(200);
    expect(response.body.results.map((result: { success: boolean }) => result.success)).toEqual([true, false, false]);
    expect(response.body.results[1].error).toMatch(/changed/i);
    expect(response.body.results[2].error).toMatch(/workspace/i);
    expect(broadcast).toHaveBeenCalledWith(local.workspace.id, 'tickets-updated', expect.objectContaining({
      projectId: local.project.id, ticket: expect.objectContaining({ id: valid.id, priority: 'urgent' }),
    }));
    expect(broadcast).not.toHaveBeenCalledWith(foreign.workspace.id, 'tickets-updated', expect.anything());
    const rows = await db.select({ id: tickets.id, priority: tickets.priority }).from(tickets);
    expect(rows.find((row) => row.id === valid.id)?.priority).toBe('urgent');
    expect(rows.find((row) => row.id === stale.id)?.priority).toBe(staleRow.priority);
    expect(rows.find((row) => row.id === outsider.id)?.priority).toBe(foreignRow.priority);
    const retry = await actor.post('/api/v1/tickets/bulk-triage').send({
      workspaceId: local.workspace.id,
      tickets: [{ id: valid.id, projectId: local.project.id, updatedAt: validRow.updatedAt.toISOString() }],
      action: { type: 'priority', value: 'low' },
    });
    expect(retry.body.results[0]).toMatchObject({ success: false, error: expect.stringMatching(/changed/i) });
  });

  it('rejects duplicate snapshots, unsupported actions, and unauthorized workspace requests', async () => {
    const actor = await createAuthenticatedApi({ email: 'bulk-validation@example.com', role: 'owner' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { id: actor.user.id, email: actor.user.email, name: actor.user.name, role: 'owner' } });
    const ticket = await seedTicket(project.id);
    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    const snapshot = { id: ticket.id, projectId: project.id, updatedAt: row.updatedAt.toISOString() };
    const base = { workspaceId: workspace.id, tickets: [snapshot], action: { type: 'status', value: 'done' } };
    expect((await actor.post('/api/v1/tickets/bulk-triage').send({ ...base, tickets: [snapshot, snapshot] })).status).toBe(400);
    expect((await actor.post('/api/v1/tickets/bulk-triage').send({ ...base, action: { type: 'cycle', value: 'cycle-1' } })).status).toBe(400);
    expect((await actor.post('/api/v1/tickets/bulk-triage').send({ ...base, workspaceId: 'another-workspace' })).status).toBe(403);
    const [unchanged] = await db.select({ status: tickets.status }).from(tickets).where(eq(tickets.id, ticket.id));
    expect(unchanged.status).toBe('todo');
  });

  it('validates labels and assignees per project for a mixed-project selection', async () => {
    const actor = await createAuthenticatedApi({ email: 'bulk-mixed@example.com', role: 'owner' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: { id: actor.user.id, email: actor.user.email, name: actor.user.name, role: 'owner' } });
    const secondProject = await actor.post('/api/v1/projects').send({ workspaceId: workspace.id, name: 'Other project', key: 'OTH', description: '' });
    expect(secondProject.status).toBe(201);
    const otherProjectId = secondProject.body.id as string;
    await db.insert(labels).values({ id: 'only-first', teamId: getDefaultTeamId(workspace.id), projectId: project.id, name: 'Only first' });
    const first = await seedTicket(project.id, { id: 'first', key: 'GRV-1' });
    const second = await seedTicket(otherProjectId, { id: 'second', key: 'OTH-1' });
    const snapshots = await Promise.all([first, second].map(async (ticket) => {
      const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
      return { id: ticket.id, projectId: row.projectId, updatedAt: row.updatedAt.toISOString() };
    }));
    const labelResponse = await actor.post('/api/v1/tickets/bulk-triage').send({
      workspaceId: workspace.id, tickets: snapshots, action: { type: 'add_label', value: 'only-first' },
    });
    expect(labelResponse.status).toBe(200);
    expect(labelResponse.body.results.map((result: { success: boolean }) => result.success)).toEqual([true, false]);
    expect(labelResponse.body.results[1].error).toMatch(/label/i);
    const assignedLabels = await db.select().from(ticketLabels);
    expect(assignedLabels).toEqual([expect.objectContaining({ ticketId: first.id, labelId: 'only-first' })]);

    const [refreshedSecond] = await db.select().from(tickets).where(eq(tickets.id, second.id));
    expect(refreshedSecond.updatedAt.toISOString()).toBe(snapshots[1].updatedAt);
    const removeResponse = await actor.post('/api/v1/tickets/bulk-triage').send({
      workspaceId: workspace.id, tickets: [snapshots[1]], action: { type: 'remove_label', value: 'only-first' },
    });
    expect(removeResponse.body.results[0]).toMatchObject({ success: false, error: expect.stringMatching(/label/i) });
    const assigneeResponse = await actor.post('/api/v1/tickets/bulk-triage').send({
      workspaceId: workspace.id, tickets: [{ ...snapshots[1], updatedAt: refreshedSecond.updatedAt.toISOString() }], action: { type: 'assignee', value: 'not-a-member' },
    });
    expect(assigneeResponse.status).toBe(200);
    expect(assigneeResponse.body.results[0]).toMatchObject({ success: false, error: expect.stringMatching(/assignee/i) });
    const [unchanged] = await db.select({ assigneeId: tickets.assigneeId }).from(tickets).where(eq(tickets.id, second.id));
    expect(unchanged.assigneeId).toBeNull();

    const eligible = await seedUser({ id: 'eligible-user', email: 'eligible@example.com' });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: eligible.id, role: 'member', createdAt: new Date() });
    await db.insert(projectMembers).values({ projectId: project.id, userId: eligible.id, role: 'member', createdAt: new Date() });
    await db.update(workspaceSettings).set({ hierarchyMode: 'teams' }).where(eq(workspaceSettings.workspaceId, workspace.id));
    const freshSnapshots = await Promise.all([first, second].map(async (item) => {
      const [current] = await db.select().from(tickets).where(eq(tickets.id, item.id));
      return { id: item.id, projectId: current.projectId, updatedAt: current.updatedAt.toISOString() };
    }));
    const mixedAssigneeResponse = await actor.post('/api/v1/tickets/bulk-triage').send({
      workspaceId: workspace.id, tickets: freshSnapshots, action: { type: 'assignee', value: eligible.id },
    });
    expect(mixedAssigneeResponse.body.results.map((result: { success: boolean }) => result.success)).toEqual([true, false]);
    const assignments = await db.select({ id: tickets.id, assigneeId: tickets.assigneeId }).from(tickets);
    expect(assignments.find((item) => item.id === first.id)?.assigneeId).toBe(eligible.id);
    expect(assignments.find((item) => item.id === second.id)?.assigneeId).toBeNull();
  });
});
