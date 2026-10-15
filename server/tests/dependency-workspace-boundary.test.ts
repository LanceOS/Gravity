import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/index.js';
import { projectMembers, projects, ticketRelationships, tickets, workspaceMembers } from '../src/db/schema.js';
import { removeCrossWorkspaceTicketRelationships } from '../src/db/relationship-integrity.js';
import { addClient, disconnectSseConnection } from '../src/realtime.js';
import { mcpEventBus, type McpMutationEvent } from '../src/lib/mcp-event-bus.js';
import { TicketTools } from '../src/modules/tickets/mcp.js';
import { createTicketDependencyRelation, listTicketDependencies, removeTicketDependencyRelation } from '../src/modules/tickets/services/tickets.js';
import { createAuthenticatedApi, seedTicket, seedUser, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { getDefaultTeamId } from '../src/modules/workspaces/utils/default-team.js';

class Stream extends EventEmitter {
  writableLength = 0;
  writableEnded = false;
  destroyed = false;
  write = vi.fn((_frame: string) => true);
  destroy = vi.fn(() => { this.destroyed = true; this.emit('close'); });
  response() { return this as unknown as Response; }
  events() { return this.write.mock.calls.map(([frame]) => JSON.parse(frame.slice(6).trim())); }
}

const streams: Stream[] = [];
function subscribe(workspaceId: string, userId: string) {
  const stream = new Stream();
  streams.push(stream);
  addClient(workspaceId, stream.response(), { userId, sourceIp: null, tokenId: null, authMethod: 'session' });
  return stream;
}

afterEach(() => {
  for (const stream of streams.splice(0)) disconnectSseConnection(stream.response(), 'test_cleanup');
});

describe('dependency workspace boundary', () => {
  it('rejects cross-workspace REST and MCP mutations without emitting ticket data', async () => {
    const actor = await createAuthenticatedApi({ email: 'dependency-actor@example.com', role: 'owner' });
    const owner = { id: actor.user.id, email: actor.user.email, name: actor.user.name, role: 'owner' };
    const a = await seedWorkspaceFixture({ owner, workspace: { id: 'dep-ws-a', key: 'DA', workspaceKey: 'WS-DA' }, project: { id: 'dep-project-a', key: 'DA', inviteCode: 'INV-DA' } });
    const b = await seedWorkspaceFixture({ owner, workspace: { id: 'dep-ws-b', key: 'DB', workspaceKey: 'WS-DB' }, project: { id: 'dep-project-b', key: 'DB', inviteCode: 'INV-DB' } });
    const source = await seedTicket(a.project.id, { id: 'dep-source', key: 'DA-1', title: 'Source workspace secret' });
    const target = await seedTicket(b.project.id, { id: 'dep-target', key: 'DB-1', title: 'Target ticket' });
    const aViewer = await seedUser({ id: 'dep-viewer-a', email: 'viewer-a@example.com' });
    const bViewer = await seedUser({ id: 'dep-viewer-b', email: 'viewer-b@example.com' });
    await db.insert(workspaceMembers).values([
      { workspaceId: a.workspace.id, userId: aViewer.id, role: 'member' },
      { workspaceId: b.workspace.id, userId: bViewer.id, role: 'member' },
    ]);
    const aStream = subscribe(a.workspace.id, aViewer.id);
    const bStream = subscribe(b.workspace.id, bViewer.id);

    for (const send of [
      () => actor.post(`/api/v1/tickets/${source.id}/dependencies`).send({ dependencyId: target.id }),
      () => actor.post(`/api/v1/tickets/${target.id}/blockers`).send({ blockerId: source.id }),
      () => actor.delete(`/api/v1/tickets/${source.id}/dependencies/${target.id}`),
      () => actor.delete(`/api/v1/tickets/${target.id}/blockers/${source.id}`),
    ]) {
      const result = await send();
      expect(result.status).toBe(409);
      expect(result.body.error).toContain('same workspace');
    }
    const sourceOnlyActor = await createAuthenticatedApi({ email: 'source-only-actor@example.com', role: 'member' });
    await db.insert(workspaceMembers).values({ workspaceId: a.workspace.id, userId: sourceOnlyActor.user.id, role: 'member' });
    await db.insert(projectMembers).values({ projectId: a.project.id, userId: sourceOnlyActor.user.id, role: 'developer' });
    const unauthorized = await sourceOnlyActor.post(`/api/v1/tickets/${source.id}/dependencies`).send({ dependencyId: target.id });
    expect([403, 404]).toContain(unauthorized.status);
    expect(unauthorized.body.error).not.toContain('same workspace');
    await expect(createTicketDependencyRelation(source.id, target.id, a.project.id, a.workspace.id)).rejects.toThrow('TICKET_DEPENDENCY_WORKSPACE_CONFLICT');
    await expect(new TicketTools().markTicketBlocked({ blockerTicketKey: source.key, dependentTicketKey: target.key },
      { workspaceId: a.workspace.id, actorUserId: actor.user.id })).rejects.toThrow();
    expect(await db.select().from(ticketRelationships)).toEqual([]);
    expect(aStream.events()).toEqual([]);
    expect(bStream.events()).toEqual([]);

    // A legacy invalid edge must be invisible on both REST and service reads.
    await db.insert(ticketRelationships).values({ ticketId: source.id, blockedTicketId: target.id, projectId: a.project.id });
    expect((await actor.delete(`/api/v1/tickets/${source.id}/dependencies/${target.id}`)).status).toBe(409);
    expect((await actor.delete(`/api/v1/tickets/${target.id}/blockers/${source.id}`)).status).toBe(409);
    expect(await db.select().from(ticketRelationships)).toHaveLength(1);
    expect((await actor.get(`/api/v1/tickets/${source.id}/dependencies`)).body).toEqual([]);
    expect((await actor.get(`/api/v1/tickets/${target.id}/blockers`)).body).toEqual([]);
    expect(await listTicketDependencies(source.id)).toEqual([]);
    const sourceDetails = (await actor.get(`/api/v1/tickets/${source.id}`)).body;
    const targetDetails = (await actor.get(`/api/v1/tickets/${target.id}`)).body;
    expect(sourceDetails.relatedTicketIds).not.toContain(target.id);
    expect(sourceDetails.isDependency).toBe(false);
    expect(targetDetails.isBlocked).toBe(false);
    expect(aStream.events()).toEqual([]);
    expect(bStream.events()).toEqual([]);
  });

  it('cleans invalid rows, preserves same-workspace rows, and routes SSE payloads to their owner', async () => {
    const actor = await createAuthenticatedApi({ email: 'dependency-cleanup@example.com', role: 'owner' });
    const owner = { id: actor.user.id, email: actor.user.email, name: actor.user.name, role: 'owner' };
    const a = await seedWorkspaceFixture({ owner, workspace: { id: 'cleanup-ws-a', key: 'CA', workspaceKey: 'WS-CA' }, project: { id: 'cleanup-project-a', key: 'CA', inviteCode: 'INV-CA' } });
    const b = await seedWorkspaceFixture({ owner, workspace: { id: 'cleanup-ws-b', key: 'CB', workspaceKey: 'WS-CB' }, project: { id: 'cleanup-project-b', key: 'CB', inviteCode: 'INV-CB' } });
    await db.insert(projects).values({ id: 'cleanup-project-a2', workspaceId: a.workspace.id, teamId: getDefaultTeamId(a.workspace.id), name: 'Second project', key: 'CC', inviteCode: 'INV-CC', createdBy: actor.user.id });
    await db.insert(projectMembers).values({ projectId: 'cleanup-project-a2', userId: actor.user.id, role: 'owner' });
    const source = await seedTicket(a.project.id, { id: 'cleanup-source', key: 'CA-1', title: 'Source secret' });
    const same = await seedTicket('cleanup-project-a2', { id: 'cleanup-same', key: 'CC-1', title: 'Same workspace' });
    const foreign = await seedTicket(b.project.id, { id: 'cleanup-foreign', key: 'CB-1', title: 'Foreign secret' });
    await db.insert(ticketRelationships).values([
      { ticketId: source.id, blockedTicketId: same.id, projectId: a.project.id },
      { ticketId: source.id, blockedTicketId: foreign.id, projectId: a.project.id },
    ]);
    expect(await removeCrossWorkspaceTicketRelationships()).toBe(1);
    expect(await removeCrossWorkspaceTicketRelationships()).toBe(0);
    expect(await db.select().from(ticketRelationships)).toEqual([expect.objectContaining({ ticketId: source.id, blockedTicketId: same.id })]);

    const aStream = subscribe(a.workspace.id, actor.user.id);
    const bViewer = await seedUser({ id: 'cleanup-b-only-subscriber', email: 'cleanup-b-viewer@example.com' });
    await db.insert(workspaceMembers).values({ workspaceId: b.workspace.id, userId: bViewer.id, role: 'member' });
    const bStream = subscribe(b.workspace.id, bViewer.id);
    const deleted = await actor.delete(`/api/v1/tickets/${source.id}/dependencies/${same.id}`);
    expect(deleted.status).toBe(200);
    const added = await actor.post(`/api/v1/tickets/${source.id}/dependencies`).send({ dependencyId: same.id });
    expect(added.status).toBe(201);
    expect(aStream.events()).toHaveLength(4);
    expect(aStream.events().map((event) => event.data.ticketId)).toEqual([source.id, same.id, source.id, same.id]);
    expect(bStream.events()).toEqual([]);
    expect(JSON.stringify(aStream.events())).not.toContain(foreign.title);
    const relation = await db.select().from(ticketRelationships).where(and(eq(ticketRelationships.ticketId, source.id), eq(ticketRelationships.blockedTicketId, same.id)));
    expect(relation).toHaveLength(1);
  });

  it('cleans more than one batch without removing a valid relation', async () => {
    const a = await seedWorkspaceFixture({ workspace: { id: 'batch-ws-a', key: 'QA', workspaceKey: 'WS-QA' }, project: { id: 'batch-project-a', key: 'QA', inviteCode: 'INV-QA' } });
    const b = await seedWorkspaceFixture({ owner: { id: a.owner.id, email: a.owner.email }, workspace: { id: 'batch-ws-b', key: 'QB', workspaceKey: 'WS-QB' }, project: { id: 'batch-project-b', key: 'QB', inviteCode: 'INV-QB' } });
    const sources = Array.from({ length: 11 }, (_, i) => ({ id: `batch-source-${i}`, key: `QA-${i + 1}`, title: `Source ${i}`, projectId: a.project.id }));
    const targets = Array.from({ length: 10 }, (_, i) => ({ id: `batch-target-${i}`, key: `QB-${i + 1}`, title: `Target ${i}`, projectId: b.project.id }));
    await db.insert(tickets).values([...sources, ...targets]);
    await db.insert(ticketRelationships).values([
      ...sources.flatMap((source) => targets.map((target) => ({ ticketId: source.id, blockedTicketId: target.id, projectId: a.project.id }))),
      { ticketId: sources[0].id, blockedTicketId: sources[1].id, projectId: a.project.id },
    ]);

    expect(await removeCrossWorkspaceTicketRelationships()).toBe(110);
    expect(await db.select().from(ticketRelationships)).toEqual([
      expect.objectContaining({ ticketId: sources[0].id, blockedTicketId: sources[1].id }),
    ]);
  });

  it('ignores legacy cross-workspace edges when checking cycles', async () => {
    const actor = await createAuthenticatedApi({ email: 'dependency-cycle@example.com', role: 'owner' });
    const owner = { id: actor.user.id, email: actor.user.email, name: actor.user.name, role: 'owner' };
    const a = await seedWorkspaceFixture({ owner, workspace: { id: 'cycle-ws-a', key: 'XA', workspaceKey: 'WS-XA' }, project: { id: 'cycle-project-a', key: 'XA', inviteCode: 'INV-XA' } });
    const b = await seedWorkspaceFixture({ owner, workspace: { id: 'cycle-ws-b', key: 'XB', workspaceKey: 'WS-XB' }, project: { id: 'cycle-project-b', key: 'XB', inviteCode: 'INV-XB' } });
    const a1 = await seedTicket(a.project.id, { id: 'cycle-a1', key: 'XA-1', title: 'A1' });
    const a2 = await seedTicket(a.project.id, { id: 'cycle-a2', key: 'XA-2', title: 'A2' });
    const b1 = await seedTicket(b.project.id, { id: 'cycle-b1', key: 'XB-1', title: 'B1' });
    await db.insert(ticketRelationships).values([
      { ticketId: a1.id, blockedTicketId: b1.id, projectId: a.project.id },
      { ticketId: b1.id, blockedTicketId: a2.id, projectId: b.project.id },
    ]);

    const response = await actor.post(`/api/v1/tickets/${a2.id}/dependencies`).send({ dependencyId: a1.id });
    expect(response.status).toBe(201);
    expect(await listTicketDependencies(a2.id)).toEqual([expect.objectContaining({ id: a1.id })]);
    expect(await removeCrossWorkspaceTicketRelationships()).toBe(2);
    expect(await db.select().from(ticketRelationships)).toEqual([expect.objectContaining({ ticketId: a2.id, blockedTicketId: a1.id })]);
  });

  it('rejects ownership changes after REST authorization for add and remove', async () => {
    const actor = await createAuthenticatedApi({ email: 'dependency-auth-race@example.com', role: 'owner' });
    const owner = { id: actor.user.id, email: actor.user.email, name: actor.user.name, role: 'owner' };
    const a = await seedWorkspaceFixture({ owner, workspace: { id: 'auth-race-a', key: 'AA', workspaceKey: 'WS-AA' }, project: { id: 'auth-race-project-a', key: 'AA', inviteCode: 'INV-AA' } });
    const b = await seedWorkspaceFixture({ owner, workspace: { id: 'auth-race-b', key: 'AB', workspaceKey: 'WS-AB' }, project: { id: 'auth-race-project-b', key: 'AB', inviteCode: 'INV-AB' } });
    const source = await seedTicket(a.project.id, { id: 'auth-race-source', key: 'AA-1' });
    const target = await seedTicket(a.project.id, { id: 'auth-race-target', key: 'AA-2' });
    const originalTransaction = db.transaction.bind(db);
    const moveBeforeWrite = () => vi.spyOn(db, 'transaction').mockImplementationOnce(async (callback, config) => {
      await db.update(projects).set({ workspaceId: b.workspace.id }).where(eq(projects.id, a.project.id));
      return originalTransaction(callback, config);
    });

    await db.insert(ticketRelationships).values({ ticketId: source.id, blockedTicketId: target.id, projectId: a.project.id });
    const deleteSpy = moveBeforeWrite();
    const deleted = await actor.delete(`/api/v1/tickets/${source.id}/dependencies/${target.id}`);
    deleteSpy.mockRestore();
    expect(deleted.status).toBe(409);
    expect(await db.select().from(ticketRelationships)).toHaveLength(1);

    await db.update(projects).set({ workspaceId: a.workspace.id }).where(eq(projects.id, a.project.id));
    await db.delete(ticketRelationships);
    const addSpy = moveBeforeWrite();
    const added = await actor.post(`/api/v1/tickets/${source.id}/dependencies`).send({ dependencyId: target.id });
    addSpy.mockRestore();
    expect(added.status).toBe(409);
    expect(await db.select().from(ticketRelationships)).toEqual([]);
  });

  it('withholds a hydrated snapshot if project ownership changes before the SSE broadcast', async () => {
    const actor = await createAuthenticatedApi({ email: 'dependency-race@example.com', role: 'owner' });
    const owner = { id: actor.user.id, email: actor.user.email, name: actor.user.name, role: 'owner' };
    const a = await seedWorkspaceFixture({ owner, workspace: { id: 'race-ws-a', key: 'RA', workspaceKey: 'WS-RA' }, project: { id: 'race-project-a', key: 'RA', inviteCode: 'INV-RA' } });
    const b = await seedWorkspaceFixture({ owner, workspace: { id: 'race-ws-b', key: 'RB', workspaceKey: 'WS-RB' }, project: { id: 'race-project-b', key: 'RB', inviteCode: 'INV-RB' } });
    const source = await seedTicket(a.project.id, { id: 'race-source', key: 'RA-1', title: 'Old workspace secret' });
    const target = await seedTicket(a.project.id, { id: 'race-target', key: 'RA-2', title: 'Target' });
    const aStream = subscribe(a.workspace.id, actor.user.id);
    const bViewer = await seedUser({ id: 'race-b-viewer', email: 'race-b-viewer@example.com' });
    await db.insert(workspaceMembers).values({ workspaceId: b.workspace.id, userId: bViewer.id, role: 'member' });
    const bStream = subscribe(b.workspace.id, bViewer.id);

    const originalTransaction = db.transaction.bind(db);
    let transactionCount = 0;
    const spy = vi.spyOn(db, 'transaction').mockImplementation(async (callback, config) => {
      transactionCount += 1;
      if (transactionCount === 2) {
        await db.update(projects).set({ workspaceId: b.workspace.id }).where(eq(projects.id, a.project.id));
      }
      return originalTransaction(callback, config);
    });
    try {
      const result = await actor.post(`/api/v1/tickets/${source.id}/dependencies`).send({ dependencyId: target.id });
      expect(result.status).toBe(201);
      expect(transactionCount).toBe(2);
      expect(aStream.events()).toEqual([]);
      expect(bStream.events()).toEqual([]);
      expect(JSON.stringify(bStream.events())).not.toContain(source.title);
      await expect(createTicketDependencyRelation(source.id, target.id, a.project.id, a.workspace.id)).rejects.toThrow('TICKET_DEPENDENCY_WORKSPACE_CONFLICT');
      await expect(removeTicketDependencyRelation(source.id, target.id, a.workspace.id)).rejects.toThrow('TICKET_DEPENDENCY_WORKSPACE_CONFLICT');
    } finally {
      spy.mockRestore();
    }
  });

  it('suppresses MCP dependency events if the project changes workspace before publication', async () => {
    const a = await seedWorkspaceFixture({ workspace: { id: 'mcp-race-a', key: 'MA', workspaceKey: 'WS-MA' }, project: { id: 'mcp-race-project-a', key: 'MA', inviteCode: 'INV-MA' } });
    const b = await seedWorkspaceFixture({ owner: { id: a.owner.id, email: a.owner.email }, workspace: { id: 'mcp-race-b', key: 'MB', workspaceKey: 'WS-MB' }, project: { id: 'mcp-race-project-b', key: 'MB', inviteCode: 'INV-MB' } });
    const source = await seedTicket(a.project.id, { id: 'mcp-race-source', key: 'MA-1', title: 'MCP source secret' });
    const target = await seedTicket(a.project.id, { id: 'mcp-race-target', key: 'MA-2', title: 'MCP target' });
    const eventsA: McpMutationEvent[] = [];
    const eventsB: McpMutationEvent[] = [];
    const unsubscribeA = mcpEventBus.subscribe(a.workspace.id, event => eventsA.push(event));
    const unsubscribeB = mcpEventBus.subscribe(b.workspace.id, event => eventsB.push(event));
    const originalTransaction = db.transaction.bind(db);
    let transactionCount = 0;
    const spy = vi.spyOn(db, 'transaction').mockImplementation(async (callback, config) => {
      transactionCount += 1;
      if (transactionCount === 2) {
        await db.update(projects).set({ workspaceId: b.workspace.id }).where(eq(projects.id, a.project.id));
      }
      return originalTransaction(callback, config);
    });
    try {
      await expect(new TicketTools().markTicketBlocked({ blockerTicketKey: source.key, dependentTicketKey: target.key },
        { workspaceId: a.workspace.id, actorUserId: a.owner.id })).resolves.toMatchObject({ success: true });
      expect(transactionCount).toBe(2);
      expect(eventsA).toEqual([]);
      expect(eventsB).toEqual([]);
    } finally {
      spy.mockRestore();
      unsubscribeA();
      unsubscribeB();
    }
  });

  it('reports committed REST and MCP mutations as successful when realtime publication fails', async () => {
    const actor = await createAuthenticatedApi({ email: 'dependency-event-failure@example.com', role: 'owner' });
    const a = await seedWorkspaceFixture({ owner: { id: actor.user.id, email: actor.user.email }, workspace: { id: 'event-failure-ws', key: 'EF', workspaceKey: 'WS-EF' }, project: { id: 'event-failure-project', key: 'EF', inviteCode: 'INV-EF' } });
    const source = await seedTicket(a.project.id, { id: 'event-failure-source', key: 'EF-1' });
    const target = await seedTicket(a.project.id, { id: 'event-failure-target', key: 'EF-2' });
    const originalTransaction = db.transaction.bind(db);
    const failPublication = () => {
      let count = 0;
      return vi.spyOn(db, 'transaction').mockImplementation(async (callback, config) => {
        count += 1;
        if (count === 2) throw new Error('simulated realtime outage');
        return originalTransaction(callback, config);
      });
    };

    const restSpy = failPublication();
    const restResult = await actor.post(`/api/v1/tickets/${source.id}/dependencies`).send({ dependencyId: target.id });
    restSpy.mockRestore();
    expect(restResult.status).toBe(201);
    expect(await db.select().from(ticketRelationships)).toHaveLength(1);

    await db.delete(ticketRelationships);
    const mcpSpy = failPublication();
    try {
      await expect(new TicketTools().markTicketBlocked({ blockerTicketKey: source.key, dependentTicketKey: target.key },
        { workspaceId: a.workspace.id, actorUserId: actor.user.id })).resolves.toMatchObject({ success: true });
      expect(await db.select().from(ticketRelationships)).toHaveLength(1);
    } finally {
      mcpSpy.mockRestore();
    }
  });
});
