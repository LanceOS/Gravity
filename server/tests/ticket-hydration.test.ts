import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { db, pool } from '../src/db/index.js';
import { comments, labels, ticketLabels, ticketRelationships, tickets, workspaceSettings } from '../src/db/schema.js';
import { getDefaultTeamId } from '../src/modules/workspaces/utils/default-team.js';
import * as realtime from '../src/realtime.js';
import { createAuthenticatedApi, seedCycle, seedTicket, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { getRelationshipCleanupDetails, getRelationshipCleanupEventTargets, getTicketDetails, getTicketDetailsByKey, listTickets } from '../src/modules/tickets/services/tickets.js';

// Count actual SQL calls, and hold each for a turn so unconstrained Promise.all
// fan-out is observable even with the in-memory adapter's immediate responses.
function measureQueries() {
  const original = pool.query.bind(pool);
  const sql: string[] = [];
  let active = 0;
  let peak = 0;
  let occupied = 0;
  let waits = 0;
  let waitMs = 0;
  const queue: Array<() => void> = [];
  const spy = vi.spyOn(pool, 'query').mockImplementation((async (...args: any[]) => {
    sql.push(typeof args[0] === 'string' ? args[0] : args[0].text);
    peak = Math.max(peak, ++active);
    // Model a ten-connection pool without touching a shared PostgreSQL service.
    if (occupied === 10) {
      waits++;
      const started = performance.now();
      await new Promise<void>((resolve) => queue.push(resolve));
      waitMs += performance.now() - started;
    } else {
      occupied++;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    try { return await (original as any)(...args); }
    finally {
      active--;
      const next = queue.shift();
      if (next) next();
      else occupied--;
    }
  }) as any);
  return { sql, peak: () => peak, waits: () => waits, waitMs: () => waitMs, stop: () => spy.mockRestore() };
}

describe('ticket hydration query regressions', () => {
  it('reads a key-based detail row once and returns the same payload as ID lookup', async () => {
    const { project } = await seedWorkspaceFixture();
    const ticket = await seedTicket(project.id);
    const expected = await getTicketDetails(ticket.id);
    const meter = measureQueries();
    expect(await getTicketDetailsByKey(ticket.key.toLowerCase())).toEqual(expected);
    meter.stop();
    expect(meter.sql.filter((sql) => sql.startsWith('select "id", "key"') && sql.includes('limit'))).toHaveLength(1);
    expect(meter.sql.length).toBeLessThanOrEqual(14);
  });

  it.each(['flat', 'teams'] as const)('preserves populated %s detail fields alongside event targets', async (hierarchyMode) => {
    const { project, workspace, owner } = await seedWorkspaceFixture();
    await db.update(workspaceSettings).set({ hierarchyMode }).where(eq(workspaceSettings.workspaceId, workspace.id));
    const cycle = await seedCycle(project.id);
    const ticket = await seedTicket(project.id, { assigneeId: owner.id, cycleId: cycle.id });
    const child = await seedTicket(project.id, { id: 'child', key: 'GRV-2', parentId: ticket.id });
    await db.insert(labels).values({ id: 'label', projectId: hierarchyMode === 'flat' ? project.id : null, name: 'Backend', color: '#abcdef', teamId: getDefaultTeamId(workspace.id) });
    await db.insert(ticketLabels).values([{ ticketId: ticket.id, labelId: 'label' }, { ticketId: child.id, labelId: 'label' }]);
    const expected = await getTicketDetails(ticket.id);
    expect(expected?.assignee?.id).toBe(owner.id);
    expect(expected?.cycle?.id).toBe(cycle.id);
    expect(expected?.labels).toHaveLength(1);
    expect(expected?.subtasks[0].labels).toHaveLength(1);
    expect(await getTicketDetailsByKey(ticket.key)).toEqual(expected);
    expect((await getRelationshipCleanupEventTargets([{ id: ticket.id, projectId: project.id }]))[0]?.ticketKey).toBe(ticket.key);
  });

  it.each([1, 100, 1000])('bounds follow-up event lookup queries for %i connected tickets', async (count) => {
    const { project, owner } = await seedWorkspaceFixture();
    const anchor = await seedTicket(project.id, { id: 'anchor', key: 'GRV-9000' });
    const affected = Array.from({ length: count }, (_, i) => ({ id: `affected-${i}`, projectId: project.id }));
    for (let start = 0; start < count; start += 100) {
      const batch = affected.slice(start, start + 100);
      await db.insert(tickets).values(batch.map((ticket, i) => ({ ...ticket, key: `GRV-${start + i + 1}`, title: 'Connected task', status: 'todo' })));
      await db.insert(ticketRelationships).values(batch.map(({ id }) => ({ ticketId: anchor.id, blockedTicketId: id, projectId: project.id })));
      await db.insert(comments).values(batch.map(({ id }) => ({ id: `comment-${id}`, ticketId: id, userId: owner.id, body: 'Follow-up context' })));
    }
    const meter = measureQueries();
    const snapshots = await getRelationshipCleanupEventTargets(affected);
    meter.stop();
    expect(snapshots).toHaveLength(count);
    expect(snapshots[0]?.ticketKey).toBe('GRV-1');
    expect(snapshots.map((snapshot) => snapshot?.ticketId)).toEqual(affected.map(({ id }) => id));
    expect(snapshots.every((snapshot) => snapshot?.ticketKey)).toBe(true);
    expect(meter.sql).toHaveLength(2 * Math.ceil(count / 100));
    expect(meter.peak()).toBe(1);
    console.info(JSON.stringify({ affected: count, queries: meter.sql.length, peakInFlight: meter.peak(), simulatedPoolWaits: meter.waits(), simulatedPoolWaitMs: meter.waitMs() }));
  }, 120_000);

  it('bounds MCP cleanup detail hydration while preserving event order', async () => {
    const { project } = await seedWorkspaceFixture();
    const affected = Array.from({ length: 12 }, (_, index) => ({ id: `mcp-${index}`, projectId: project.id }));
    await db.insert(tickets).values(affected.map(({ id }, index) => ({
      id, key: `GRV-${index + 1}`, title: `MCP ${index}`, projectId: project.id,
    })));
    const meter = measureQueries();
    const details = await getRelationshipCleanupDetails(affected);
    meter.stop();
    expect(details.map(({ ticket }) => ticket.id)).toEqual(affected.map(({ id }) => id));
    expect(details.every(({ scope }) => scope.id === project.id)).toBe(true);
    expect(meter.peak()).toBeLessThanOrEqual(12);
  });

  it('uses a cursor without skipping tickets deleted before the next page', async () => {
    const api = await createAuthenticatedApi({ name: 'Owner', email: 'cursor@example.com', role: 'owner' });
    const { project } = await seedWorkspaceFixture({ owner: {
      id: api.user.id, name: api.user.name, email: api.user.email, role: 'owner', avatarUrl: api.user.avatar,
    } });
    for (let index = 0; index < 4; index++) {
      await seedTicket(project.id, { id: `cursor-${index}`, key: `GRV-${index + 1}` });
    }
    const first = await api.get('/api/v1/tickets?pagination=cursor&limit=2').set('x-project-id', project.id);
    expect(first.status, first.body.error).toBe(200);
    expect(first.body.tickets.map((ticket: { id: string }) => ticket.id)).toEqual(['cursor-0', 'cursor-1']);
    expect(first.body.nextCursor).toBeTypeOf('string');
    const wrongFilter = await api.get(`/api/v1/tickets?pagination=cursor&limit=2&status=done&cursor=${encodeURIComponent(first.body.nextCursor)}`)
      .set('x-project-id', project.id);
    expect(wrongFilter.status).toBe(400);
    await db.delete(tickets).where(eq(tickets.id, 'cursor-0'));
    const second = await api.get(`/api/v1/tickets?pagination=cursor&limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`)
      .set('x-project-id', project.id);
    expect(second.status).toBe(200);
    expect(second.body.tickets.map((ticket: { id: string }) => ticket.id)).toEqual(['cursor-2', 'cursor-3']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('paginates project tickets after filtering and sorting the full project', async () => {
    const api = await createAuthenticatedApi({ name: 'Owner', email: 'project-pages@example.com', role: 'owner' });
    const { project, workspace } = await seedWorkspaceFixture({ owner: {
      id: api.user.id, name: api.user.name, email: api.user.email, role: 'owner', avatarUrl: api.user.avatar,
    } });
    await seedTicket(project.id, { id: 'project-low', key: 'GRV-1', title: 'Search match one', status: 'todo', priority: 'low' });
    await seedTicket(project.id, { id: 'project-urgent', key: 'GRV-2', title: 'Search match two', status: 'todo', priority: 'urgent' });
    await seedTicket(project.id, { id: 'project-done', key: 'GRV-3', title: 'Search match three', status: 'done', priority: 'urgent' });
    await db.insert(labels).values({ id: 'project-page-label', projectId: project.id, name: 'Alpha', color: '#abcdef', teamId: getDefaultTeamId(workspace.id) });
    await db.insert(ticketLabels).values({ ticketId: 'project-low', labelId: 'project-page-label' });
    const first = await api.get('/api/v1/tickets?pagination=page&limit=1&offset=0&status=todo&search=search&listSort=newest_urgent')
      .set('x-project-id', project.id);
    expect(first.status, first.body.error).toBe(200);
    expect(first.body.tickets.map((ticket: { id: string }) => ticket.id)).toEqual(['project-urgent']);
    expect(first.body.nextOffset).toBe(1);
    expect(first.body.counts.activeProjectIssues).toBe(2);
    const second = await api.get('/api/v1/tickets?pagination=page&limit=1&offset=1&status=todo&search=search&listSort=newest_urgent')
      .set('x-project-id', project.id);
    expect(second.status).toBe(200);
    expect(second.body.tickets.map((ticket: { id: string }) => ticket.id)).toEqual(['project-low']);
    expect(second.body.nextOffset).toBeNull();
  });

  it('pushes label ordering and the page limit into one database query', async () => {
    const queries: string[] = [];
    const spy = vi.spyOn(pool, 'query').mockImplementation((async (...args: any[]) => {
      queries.push(typeof args[0] === 'string' ? args[0] : args[0].text);
      return { rows: [], rowCount: 0 } as any;
    }) as any);
    try {
      expect(await listTickets('project-1', { listSort: 'label', limit: 2, offset: 0 })).toEqual([]);
    } finally {
      spy.mockRestore();
    }
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('order by case when (select');
    expect(queries[0]).toMatch(/limit\s+\$\d+/i);
  });

  it('hides database query details from failed ticket-list responses', async () => {
    const api = await createAuthenticatedApi({ name: 'Owner', email: 'ticket-error@example.com', role: 'owner' });
    const { project } = await seedWorkspaceFixture({ owner: {
      id: api.user.id, name: api.user.name, email: api.user.email, role: 'owner', avatarUrl: api.user.avatar,
    } });
    const original = pool.query.bind(pool);
    const spy = vi.spyOn(pool, 'query').mockImplementation((async (...args: any[]) => {
      const statement = typeof args[0] === 'string' ? args[0] : args[0].text;
      if (statement.includes('from "tickets"')) throw new Error('Failed query: internal_schema.secret_table');
      return (original as any)(...args);
    }) as any);
    try {
      const response = await api.get('/api/v1/tickets?pagination=page&listSort=created').set('x-project-id', project.id);
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to load tickets.' });
      expect(JSON.stringify(response.body)).not.toContain('internal_schema');
    } finally {
      spy.mockRestore();
    }
  });

  it('emits follow-up invalidations without an actor after closing a ticket', async () => {
    const api = await createAuthenticatedApi({ name: 'Owner', email: 'cleanup@example.com', role: 'owner' });
    const { project, workspace } = await seedWorkspaceFixture({ owner: {
      id: api.user.id, name: api.user.name, email: api.user.email, role: 'owner', avatarUrl: api.user.avatar,
    } });
    const anchor = await seedTicket(project.id, { id: 'anchor', key: 'GRV-1' });
    const affected = await seedTicket(project.id, { id: 'affected', key: 'GRV-2' });
    await db.insert(ticketRelationships).values({ ticketId: anchor.id, blockedTicketId: affected.id, projectId: project.id });
    const emit = vi.spyOn(realtime, 'broadcastToWorkspace');
    const response = await api.patch(`/api/v1/tickets/${anchor.id}`).set('x-project-id', project.id).send({ status: 'done' });
    expect(response.status).toBe(200);
    const calls = emit.mock.calls.filter(([, type, payload]) => type === 'tickets-updated' && (payload as any).ticketId === affected.id);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([workspace.id, 'tickets-updated', {
      projectId: project.id, ticketId: affected.id, ticketKey: affected.key, relationshipCleanup: true,
    }]);
  });

  it('keeps missing and moved ticket fallbacks and skips missing scopes', async () => {
    const { project, workspace } = await seedWorkspaceFixture();
    await seedTicket('another-project', { id: 'moved', key: 'MOVE-1' });
    const snapshots = await getRelationshipCleanupEventTargets([
      { id: 'deleted', projectId: project.id },
      { id: 'deleted', projectId: 'missing-project' },
      { id: 'moved', projectId: project.id },
    ]);
    expect(snapshots).toEqual([{ projectId: project.id, ticketId: 'deleted', workspaceId: workspace.id, ticketKey: null }, null, { projectId: project.id, ticketId: 'moved', workspaceId: workspace.id, ticketKey: null }]);
    expect(await getRelationshipCleanupEventTargets([])).toEqual([]);
  });
});
