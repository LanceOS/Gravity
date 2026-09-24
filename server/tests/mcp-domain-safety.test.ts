import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/index.js';
import { cycles, labels, projectMembers, projects, teams, ticketLabels, ticketRelationships, tickets, workspaceMembers, workspaceSettings } from '../src/db/schema.js';
import { ticketToolDefinitions, ticketToolHandlers, TicketTools } from '../src/modules/tickets/mcp.js';
import { workspaceToolDefinitions, workspaceToolHandlers } from '../src/modules/workspaces/mcp.js';
import { updateProjectRecord } from '../src/modules/workspaces/services/projects.js';
import { createTicketRecord, getProjectScope, getTicketById, getTicketDetails, updateTicketRecord } from '../src/modules/tickets/services/tickets.js';
import { validateToolArguments } from '../src/modules/mcp/validation.js';
import { McpToolValidationError } from '../src/modules/mcp/errors.js';
import { mcpEventBus, type McpMutationEvent } from '../src/lib/mcp-event-bus.js';
import { seedTicket, seedUser, seedWorkspaceFixture } from './helpers/test-helpers.js';

async function fixture() {
  const base = await seedWorkspaceFixture();
  const scope = (await getProjectScope(base.project.id))!;
  const context = { workspaceId: base.workspace.id, actorUserId: base.owner.id };
  return { ...base, scope, context, tools: new TicketTools() };
}

async function foreignFixture() {
  return seedWorkspaceFixture({
    owner: { id: 'foreign-owner', email: 'foreign-owner@example.com' },
    workspace: { id: 'foreign-workspace', key: 'FOR', workspaceKey: 'WS-FOR' },
    project: { id: 'foreign-project', key: 'FOR', inviteCode: 'INV-FOR' },
  });
}

async function seedCycle(teamId: string, id = 'cycle-local') {
  await db.insert(cycles).values({ id, teamId, name: id, startDate: new Date('2026-01-01'), endDate: new Date('2026-01-15') });
  return id;
}

async function secondProject(base: Awaited<ReturnType<typeof fixture>>, teamId = base.scope.teamId) {
  const id = 'second-project';
  await db.insert(projects).values({ id, workspaceId: base.workspace.id, teamId, name: 'Second', key: 'SEC', inviteCode: 'INV-SEC', createdBy: base.owner.id });
  return id;
}


function pauseNextTransaction() {
  const original = db.transaction.bind(db);
  let release!: () => void;
  let signalEntered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { signalEntered = resolve; });
  const spy = vi.spyOn(db, 'transaction').mockImplementationOnce(async (callback, config) => {
    signalEntered();
    await gate;
    return original(callback, config);
  });
  return { entered, release, restore: () => spy.mockRestore() };
}

describe('MCP domain safety and discovery', () => {
  it('advertises tool schemas that compile under the shared strict runtime validator', () => {
    for (const tool of [...ticketToolDefinitions, ...workspaceToolDefinitions]) {
      try { validateToolArguments(tool, {}); } catch (error) {
        expect(error, `Schema compilation failed for ${tool.name}`).toBeInstanceOf(McpToolValidationError);
      }
    }
  });

  it('rejects foreign cycles and parents on both create and update without modifying tickets', async () => {
    const base = await fixture();
    const foreign = await foreignFixture();
    const foreignScope = (await getProjectScope(foreign.project.id))!;
    const cycleId = await seedCycle(foreignScope.teamId, 'foreign-cycle');
    const parent = await seedTicket(foreign.project.id, { id: 'foreign-parent', key: 'FOR-1' });
    const ticket = await seedTicket(base.project.id);
    for (const patch of [{ cycleId }, { parentId: parent.id }]) {
      await expect(createTicketRecord({ title: 'Rejected', projectId: base.project.id, ...patch })).rejects.toThrow(/SCOPE_VIOLATION/);
      await expect(updateTicketRecord(ticket.id, patch, base.project.id)).rejects.toThrow(/SCOPE_VIOLATION/);
    }
    expect(await db.select().from(tickets).where(eq(tickets.projectId, base.project.id))).toEqual([
      expect.objectContaining({ id: ticket.id, cycleId: null, parentId: null }),
    ]);
  });

  it('rejects self-parent and ancestor cycles, and parents in another project', async () => {
    const base = await fixture();
    const parent = await createTicketRecord({ projectId: base.project.id, title: 'Parent' });
    const child = await createTicketRecord({ projectId: base.project.id, title: 'Child', parentId: parent.id });
    const grandchild = await createTicketRecord({ projectId: base.project.id, title: 'Grandchild', parentId: child.id });
    await expect(updateTicketRecord(parent.id, { parentId: parent.id })).rejects.toThrow('TICKET_PARENT_CYCLE');
    await expect(updateTicketRecord(parent.id, { parentId: grandchild.id })).rejects.toThrow('TICKET_PARENT_CYCLE');
    const projectId = await secondProject(base);
    await expect(createTicketRecord({ projectId, title: 'Cross project', parentId: parent.id })).rejects.toThrow('TICKET_PARENT_SCOPE_VIOLATION');
    expect((await getTicketById(parent.id))?.parentId).toBeNull();
  });

  it('rejects a cycle in a different team within the workspace', async () => {
    const base = await fixture();
    await db.insert(teams).values({ id: 'other-team', workspaceId: base.workspace.id, name: 'Other' });
    const cycleId = await seedCycle('other-team');
    await expect(createTicketRecord({ projectId: base.project.id, title: 'Wrong team', cycleId })).rejects.toThrow('TICKET_CYCLE_SCOPE_VIOLATION');
  });

  it('does not expose corrupt historical foreign cycle, child or dependency records in ticket details', async () => {
    const base = await fixture();
    const foreign = await foreignFixture();
    const foreignScope = (await getProjectScope(foreign.project.id))!;
    const cycleId = await seedCycle(foreignScope.teamId, 'foreign-cycle');
    const ticket = await seedTicket(base.project.id);
    const foreignTicket = await seedTicket(foreign.project.id, { id: 'foreign-ticket', key: 'FOR-1' });
    await db.update(tickets).set({ cycleId }).where(eq(tickets.id, ticket.id));
    await db.update(tickets).set({ parentId: ticket.id }).where(eq(tickets.id, foreignTicket.id));
    await db.insert(ticketRelationships).values({ ticketId: ticket.id, blockedTicketId: foreignTicket.id, projectId: base.project.id });
    const details = await getTicketDetails(ticket.id, base.project.id);
    expect(details?.cycle).toBeNull();
    expect(details?.subtasks).toEqual([]);
    expect(details?.dependencies).toEqual([]);
  });

  it('preserves omitted relationships and clears explicit nulls through MCP', async () => {
    const base = await fixture();
    const cycleId = await seedCycle(base.scope.teamId);
    const parent = await createTicketRecord({ projectId: base.project.id, title: 'Parent' });
    const ticket = await createTicketRecord({ projectId: base.project.id, title: 'Child', parentId: parent.id, cycleId, assigneeId: base.owner.id });
    await base.tools.updateTicket({ ticketKey: ticket.key, title: 'Renamed' }, base.context);
    expect(await getTicketById(ticket.id)).toMatchObject({ parentId: parent.id, cycleId, assigneeId: base.owner.id });
    await base.tools.updateTicket({ ticketKey: ticket.key, parentId: null, cycleId: null, assigneeId: null }, base.context);
    expect(await getTicketById(ticket.id)).toMatchObject({ parentId: null, cycleId: null, assigneeId: null });
  });

  it('moves with hierarchy cleanup and publishes fresh child, moved-ticket and old-parent details', async () => {
    const base = await fixture();
    const parent = await createTicketRecord({ projectId: base.project.id, title: 'Parent' });
    const ticket = await createTicketRecord({ projectId: base.project.id, title: 'Middle', parentId: parent.id });
    const child = await createTicketRecord({ projectId: base.project.id, title: 'Child', parentId: ticket.id });
    const projectId = await secondProject(base);
    const events: McpMutationEvent[] = [];
    const unsubscribe = mcpEventBus.subscribe(base.workspace.id, event => events.push(event));
    try {
      await ticketToolHandlers.move_ticket({ ticketKey: ticket.key, projectId }, base.context);
      expect(await getTicketById(ticket.id)).toMatchObject({ projectId, parentId: null });
      expect((await getTicketById(child.id))?.parentId).toBeNull();
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'ticket.updated', projectId: base.project.id, ticketKey: child.key,
          data: { ticket: expect.objectContaining({ id: child.id, parentId: null, isSubtask: false }) } }),
        expect.objectContaining({ type: 'ticket.updated', projectId: base.project.id, ticketKey: parent.key,
          data: { ticket: expect.objectContaining({ id: parent.id, subtasks: [] }) } }),
        expect.objectContaining({ type: 'ticket.updated', projectId, ticketKey: ticket.key,
          data: expect.objectContaining({ ticket: expect.objectContaining({ id: ticket.id, parentId: null, subtasks: [] }) }) }),
      ]));
    } finally { unsubscribe(); }
  });

  it('refreshes both parent detail snapshots when changing or clearing a parent', async () => {
    const base = await fixture();
    const futureTimestamp = new Date('2099-01-01T00:00:00Z');
    const firstParent = await createTicketRecord({ projectId: base.project.id, title: 'First parent', updatedAt: futureTimestamp });
    const secondParent = await createTicketRecord({ projectId: base.project.id, title: 'Second parent', updatedAt: futureTimestamp });
    const child = await createTicketRecord({ projectId: base.project.id, title: 'Child', parentId: firstParent.id });
    const events: McpMutationEvent[] = [];
    const unsubscribe = mcpEventBus.subscribe(base.workspace.id, event => events.push(event));
    try {
      await ticketToolHandlers.set_ticket_parent({ ticketKey: child.key, parentId: secondParent.id }, base.context);
      expect(events.find(event => event.ticketKey === firstParent.key)?.data?.ticket).toMatchObject({ subtasks: [] });
      expect(events.find(event => event.ticketKey === secondParent.key)?.data?.ticket).toMatchObject({ subtasks: [expect.objectContaining({ id: child.id })] });
      const changedParents = await Promise.all([getTicketById(firstParent.id), getTicketById(secondParent.id)]);
      for (const parent of changedParents) expect(new Date(parent!.updatedAt).getTime()).toBeGreaterThan(futureTimestamp.getTime());
      events.length = 0;
      await ticketToolHandlers.clear_ticket_parent({ ticketKey: child.key }, base.context);
      expect(events.find(event => event.ticketKey === secondParent.key)?.data?.ticket).toMatchObject({ subtasks: [] });
      expect(new Date((await getTicketById(secondParent.id))!.updatedAt).getTime()).toBeGreaterThan(new Date(changedParents[1]!.updatedAt).getTime());
    } finally { unsubscribe(); }
  });

  it.each([false, true])('clears incompatible cycles when reassigning a project team with destination cycles=%s', async hasDestinationCycle => {
    const base = await fixture();
    await db.insert(teams).values({ id: 'destination-team', workspaceId: base.workspace.id, name: 'Destination' });
    const oldCycle = await seedCycle(base.scope.teamId, 'old-team-cycle');
    const validCycle = hasDestinationCycle ? await seedCycle('destination-team', 'destination-cycle') : null;
    const oldScheduled = await createTicketRecord({ projectId: base.project.id, title: 'Old scheduled', cycleId: oldCycle });
    const stillScheduled = await createTicketRecord({ projectId: base.project.id, title: 'Still scheduled' });
    // Historical data can already reference the destination cycle. Keep that valid assignment.
    await db.update(tickets).set({ cycleId: validCycle }).where(eq(tickets.id, stillScheduled.id));
    const otherProjectId = await secondProject(base);
    const otherScheduled = await createTicketRecord({ projectId: otherProjectId, title: 'Other project', cycleId: oldCycle });

    await updateProjectRecord(base.project.id, { teamId: 'destination-team' });

    expect(await getTicketById(oldScheduled.id)).toMatchObject({ cycleId: null });
    expect(await getTicketById(stillScheduled.id)).toMatchObject({ cycleId: validCycle });
    expect(await getTicketById(otherScheduled.id)).toMatchObject({ cycleId: oldCycle });
    await expect(base.tools.updateTicket({ ticketKey: oldScheduled.key, title: 'Edited after reassignment' }, base.context))
      .resolves.toMatchObject({ ticket: { title: 'Edited after reassignment', cycleId: null } });
  });

  it('validates the current assignee under the move lock after a concurrent assignment', async () => {
    const base = await fixture();
    await db.update(workspaceSettings).set({ hierarchyMode: 'teams' }).where(eq(workspaceSettings.workspaceId, base.workspace.id));
    const projectId = await secondProject(base);
    await db.insert(projectMembers).values({ projectId, userId: base.owner.id, role: 'owner' });
    const member = await seedUser({ id: 'source-only-member', email: 'source-only@example.com' });
    await db.insert(workspaceMembers).values({ workspaceId: base.workspace.id, userId: member.id, role: 'member' });
    await db.insert(projectMembers).values({ projectId: base.project.id, userId: member.id, role: 'developer' });
    const ticket = await createTicketRecord({ projectId: base.project.id, title: 'Moving ticket', assigneeId: base.owner.id });
    const gate = pauseNextTransaction();
    const events: McpMutationEvent[] = [];
    const unsubscribe = mcpEventBus.subscribe(base.workspace.id, event => events.push(event));
    const outcome = ticketToolHandlers.move_ticket({ ticketKey: ticket.key, projectId }, base.context).catch(error => error);
    try {
      await gate.entered;
      await updateTicketRecord(ticket.id, { assigneeId: member.id }, base.project.id);
      gate.release();
      expect(await outcome).toBeInstanceOf(McpToolValidationError);
      expect(await getTicketById(ticket.id)).toMatchObject({ projectId: base.project.id, assigneeId: member.id });
      expect(events).toEqual([]);
    } finally { gate.release(); gate.restore(); unsubscribe(); }
  });

  it('validates retained cycle and parent references from the current locked ticket', async () => {
    const base = await fixture();
    const parent = await createTicketRecord({ projectId: base.project.id, title: 'Old parent' });
    const cycleId = await seedCycle(base.scope.teamId);
    const ticket = await createTicketRecord({ projectId: base.project.id, title: 'Old title', parentId: parent.id, cycleId });
    const gate = pauseNextTransaction();
    const outcome = updateTicketRecord(ticket.id, { title: 'New title' }, base.project.id);
    try {
      await gate.entered;
      await updateTicketRecord(ticket.id, { parentId: null, cycleId: null }, base.project.id);
      await db.delete(tickets).where(eq(tickets.id, parent.id));
      await db.delete(cycles).where(eq(cycles.id, cycleId));
      gate.release();
      expect(await outcome).toMatchObject({ title: 'New title', parentId: null, cycleId: null });
    } finally { gate.release(); gate.restore(); }
  });

  it.each(['move', 'delete'])('reports a concurrent %s as a failed tool without success events', async operation => {
    const base = await fixture();
    const ticket = await createTicketRecord({ projectId: base.project.id, title: 'Moving ticket' });
    const projectId = await secondProject(base);
    const gate = pauseNextTransaction();
    const events: McpMutationEvent[] = [];
    const unsubscribe = mcpEventBus.subscribe(base.workspace.id, event => events.push(event));
    const outcome = ticketToolHandlers.move_ticket({ ticketKey: ticket.key, projectId }, base.context).catch(error => error);
    try {
      await gate.entered;
      if (operation === 'move') await updateTicketRecord(ticket.id, { projectId }, base.project.id);
      else await db.delete(tickets).where(eq(tickets.id, ticket.id));
      gate.release();
      expect(await outcome).toMatchObject({ message: 'Ticket moved or was deleted; reload it and retry.' });
      expect(events).toEqual([]);
    } finally { gate.release(); gate.restore(); unsubscribe(); }
  });

  it('exposes IDs for team labels through project discovery, deduplicates input and rejects omitted/invalid replacement', async () => {
    const base = await fixture();
    await db.update(workspaceSettings).set({ hierarchyMode: 'teams' }).where(eq(workspaceSettings.workspaceId, base.workspace.id));
    await db.insert(labels).values({ id: 'label-bug', teamId: base.scope.teamId, name: 'Bug', color: '#ff0000' });
    const ticket = await seedTicket(base.project.id);
    expect(await base.tools.listWorkspaceLabels({ projectId: base.project.id }, base.context)).toMatchObject({ labels: [{ id: 'label-bug', name: 'Bug', teamId: base.scope.teamId }] });
    await base.tools.setTicketLabels({ ticketKey: ticket.key, labels: ['Bug', 'Bug'] }, base.context);
    for (const invalid of [undefined, null, 5, ['Bug', 1]]) {
      await expect(base.tools.setTicketLabels({ ticketKey: ticket.key, labels: invalid }, base.context)).rejects.toThrow();
      expect(await db.select().from(ticketLabels).where(eq(ticketLabels.ticketId, ticket.id))).toEqual([{ ticketId: ticket.id, labelId: 'label-bug' }]);
    }
    await base.tools.addTicketLabels({ ticketKey: ticket.key, labelIds: ['label-bug', 'label-bug'] }, base.context);
    expect((await base.tools.getTicketLabels({ ticketKey: ticket.key }, base.context)).labels).toHaveLength(1);
    await base.tools.setTicketLabels({ ticketKey: ticket.key, labelIds: [] }, base.context);
    expect((await base.tools.getTicketLabels({ ticketKey: ticket.key }, base.context)).labels).toEqual([]);
  });

  it('preserves concurrent additive and subtractive label changes', async () => {
    const base = await fixture();
    const ticket = await seedTicket(base.project.id);
    await db.insert(labels).values(['a', 'b', 'c'].map(id => ({ id: `label-${id}`, name: id, teamId: base.scope.teamId, projectId: base.project.id })));
    await Promise.all(['a', 'b'].map(id => base.tools.addTicketLabels({ ticketKey: ticket.key, labelIds: [`label-${id}`] }, base.context)));
    expect((await base.tools.getTicketLabels({ ticketKey: ticket.key }, base.context)).labels.map(label => label.id)).toEqual(['label-a', 'label-b']);
    await Promise.all([
      base.tools.removeTicketLabels({ ticketKey: ticket.key, labelIds: ['label-a'] }, base.context),
      base.tools.addTicketLabels({ ticketKey: ticket.key, labelIds: ['label-c'] }, base.context),
    ]);
    expect((await base.tools.getTicketLabels({ ticketKey: ticket.key }, base.context)).labels.map(label => label.id)).toEqual(['label-b', 'label-c']);
  });

  it('rejects label replacement when a concurrent move makes the write fail without publishing success', async () => {
    const base = await fixture();
    const ticket = await createTicketRecord({ projectId: base.project.id, title: 'Moving during replacement' });
    const projectId = await secondProject(base);
    await db.insert(labels).values({ id: 'destination-label', name: 'Destination', teamId: base.scope.teamId, projectId });
    const gate = pauseNextTransaction();
    const events: McpMutationEvent[] = [];
    const unsubscribe = mcpEventBus.subscribe(base.workspace.id, event => events.push(event));
    const outcome = base.tools.setTicketLabels({ ticketKey: ticket.key, labelIds: [] }, base.context).catch(error => error);
    try {
      await gate.entered;
      await updateTicketRecord(ticket.id, { projectId, labelIds: ['destination-label'] }, base.project.id);
      gate.release();
      expect(await outcome).toMatchObject({ message: 'Ticket moved or was deleted; reload it and retry.' });
      expect(await getTicketById(ticket.id)).toMatchObject({ projectId });
      expect(await base.tools.getTicketLabels({ ticketKey: ticket.key }, base.context))
        .toMatchObject({ labels: [{ id: 'destination-label' }] });
      expect(events).toEqual([]);
    } finally { gate.release(); gate.restore(); unsubscribe(); }
  });

  it('does not remove a reverse dependency for explicitly directed removal or preview', async () => {
    const base = await fixture();
    const first = await createTicketRecord({ projectId: base.project.id, title: 'First' });
    const second = await createTicketRecord({ projectId: base.project.id, title: 'Second' });
    await db.insert(ticketRelationships).values({ ticketId: second.id, blockedTicketId: first.id, projectId: base.project.id });
    const args = { blocker_ticket_key: first.key, dependent_ticket_key: second.key };
    expect(await base.tools.previewTicketDependency({ ...args, operation: 'remove' }, base.context)).toMatchObject({ ok: false, status: 'no_relation' });
    await expect(ticketToolHandlers.unmark_ticket_blocked(args, base.context)).rejects.toThrow('No dependency relationship');
    expect(await db.select().from(ticketRelationships).where(and(eq(ticketRelationships.ticketId, second.id), eq(ticketRelationships.blockedTicketId, first.id)))).toHaveLength(1);
  });

  it('searches within authorized project/team/date/parent filters with deterministic bounded pages', async () => {
    const base = await fixture();
    const foreign = await foreignFixture();
    await createTicketRecord({ projectId: foreign.project.id, title: 'Needle private' });
    const createdAt = new Date('2026-09-01T00:00:00Z');
    const first = await createTicketRecord({ projectId: base.project.id, title: 'Needle one', createdAt });
    const second = await createTicketRecord({ projectId: base.project.id, title: 'Needle two', createdAt });
    await createTicketRecord({ projectId: base.project.id, title: 'Needle child', parentId: first.id, createdAt });
    await createTicketRecord({ projectId: base.project.id, title: 'Unrelated', createdAt });
    const args = { query: 'Needle', teamId: base.scope.teamId, parentId: null, createdAfter: '2026-08-01', createdBefore: '2026-10-01', limit: 1 };
    const page = await base.tools.searchTickets(args, base.context);
    expect(page.tickets).toHaveLength(1);
    expect(page.nextCursor).toBeTypeOf('string');
    const nextPage = await base.tools.searchTickets({ ...args, cursor: page.nextCursor }, base.context);
    expect(nextPage.nextCursor).toBeNull();
    expect(new Set([page.tickets[0].id, nextPage.tickets[0].id])).toEqual(new Set([first.id, second.id]));
    await expect(base.tools.listTickets({ limit: 101 }, base.context)).rejects.toThrow();
    await expect(base.tools.searchTickets({ cursor: 'bad' }, base.context)).rejects.toThrow('Invalid ticket search cursor');
  });

  it('discovers safe context and rejects foreign project/team discovery', async () => {
    const base = await fixture();
    const foreign = await foreignFixture();
    await seedCycle(base.scope.teamId);
    const projectsResult = await workspaceToolHandlers.list_projects({}, base.context);
    expect(projectsResult).toEqual([expect.objectContaining({ id: base.project.id })]);
    expect(JSON.stringify(projectsResult)).not.toContain('inviteCode');
    expect(await workspaceToolHandlers.list_cycles({ projectId: base.project.id }, base.context)).toEqual([expect.objectContaining({ id: 'cycle-local' })]);
    expect(await workspaceToolHandlers.list_project_assignees({ projectId: base.project.id }, base.context)).toEqual([expect.objectContaining({ id: base.owner.id })]);
    expect(await workspaceToolHandlers.list_ticket_options({}, base.context)).toMatchObject({ statuses: expect.arrayContaining(['in_progress']), priorities: expect.arrayContaining(['urgent']) });
    await expect(workspaceToolHandlers.get_project({ projectId: foreign.project.id }, base.context)).rejects.toThrow('Project not found');
    await expect(workspaceToolHandlers.list_cycles({ teamId: (await getProjectScope(foreign.project.id))!.teamId }, base.context)).rejects.toThrow('Team not found');
  });

  it('focused workflow handlers cannot alter other ticket fields even when called directly', async () => {
    const base = await fixture();
    const ticket = await seedTicket(base.project.id);
    await ticketToolHandlers.set_ticket_status({ ticketKey: ticket.key, status: 'in_progress', title: 'Unexpected' }, base.context);
    expect(await getTicketById(ticket.id)).toMatchObject({ status: 'in_progress', title: ticket.title });
    expect(ticketToolDefinitions.find(tool => tool.name === 'set_ticket_status')?.inputSchema).toMatchObject({ additionalProperties: false, required: ['ticketKey', 'status'] });
  });
});
