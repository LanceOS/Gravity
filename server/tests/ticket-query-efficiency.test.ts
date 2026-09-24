import { describe, expect, it, vi } from 'vitest';
import { db, pool } from '../src/db/index.js';
import { comments, ticketRelationships, tickets } from '../src/db/schema.js';
import {
  addCommentRecord,
  listComments,
  listTickets,
  listWorkspaceTickets,
  updateCommentRecord,
} from '../src/modules/tickets/services/tickets.js';
import { seedTicket, seedWorkspaceFixture } from './helpers/test-helpers.js';

async function seedRelatedTickets() {
  const { project } = await seedWorkspaceFixture();
  const createdAt = new Date('2026-01-01T00:00:00Z');
  await db.insert(tickets).values([
    { id: 'ticket-a', key: 'GRV-1', title: 'First page', status: 'todo', projectId: project.id, createdAt },
    { id: 'ticket-b', key: 'GRV-2', title: 'Completed', status: 'done', projectId: project.id, createdAt },
    { id: 'ticket-c', key: 'GRV-3', title: 'Active blocker', status: 'in_progress', projectId: project.id, createdAt },
    { id: 'ticket-d', key: 'GRV-4', title: 'Canceled', status: 'canceled', projectId: project.id, createdAt },
  ]);
  await db.insert(ticketRelationships).values([
    { ticketId: 'ticket-a', blockedTicketId: 'ticket-b', projectId: project.id },
    { ticketId: 'ticket-c', blockedTicketId: 'ticket-a', projectId: project.id },
    { ticketId: 'ticket-d', blockedTicketId: 'ticket-c', projectId: project.id },
  ]);
  return project;
}

describe('ticket query efficiency', () => {
  it('hydrates a full ticket list in four queries while preserving active relationship flags', async () => {
    const project = await seedRelatedTickets();
    const selectSpy = vi.spyOn(db, 'select');

    const result = await listTickets(project.id);

    expect(selectSpy).toHaveBeenCalledTimes(4);
    expect(result.map(({ id, isBlocked, isDependency, projectName }) => ({ id, isBlocked, isDependency, projectName }))).toEqual([
      { id: 'ticket-a', isBlocked: true, isDependency: false, projectName: project.name },
      { id: 'ticket-b', isBlocked: false, isDependency: false, projectName: project.name },
      { id: 'ticket-c', isBlocked: false, isDependency: true, projectName: project.name },
      { id: 'ticket-d', isBlocked: false, isDependency: false, projectName: project.name },
    ]);

    selectSpy.mockClear();
    expect(await listWorkspaceTickets([project.id])).toEqual(result);
    expect(selectSpy).toHaveBeenCalledTimes(4);
  });

  it('still loads statuses outside the page and skips relationship queries for terminal-only results', async () => {
    const project = await seedRelatedTickets();
    const selectSpy = vi.spyOn(db, 'select');

    const page = await listTickets(project.id, { limit: 1 });

    expect(page).toHaveLength(1);
    expect(page[0]).toMatchObject({ id: 'ticket-a', isBlocked: true, isDependency: false });
    expect(selectSpy).toHaveBeenCalledTimes(5);

    selectSpy.mockClear();
    const terminalPage = await listWorkspaceTickets([project.id], { limit: 1, offset: 1 });
    expect(terminalPage).toHaveLength(1);
    expect(terminalPage[0]).toMatchObject({ id: 'ticket-b', isBlocked: false, isDependency: false });
    expect(selectSpy).toHaveBeenCalledTimes(2);
  });
});

describe('comment mutation readback', () => {
  it('reads only the created comment even when it predates a large existing discussion', async () => {
    const { owner, project } = await seedWorkspaceFixture();
    const ticket = await seedTicket(project.id);
    await db.insert(comments).values(Array.from({ length: 40 }, (_, index) => ({
      id: `existing-${index}`,
      ticketId: ticket.id,
      userId: owner.id,
      body: `Existing comment ${index}`,
      createdAt: new Date('2026-02-01T00:00:00Z'),
    })));
    const querySpy = vi.spyOn(pool, 'query');

    const created = await addCommentRecord(ticket.id, owner.id, 'Imported comment', new Date('2026-01-01T00:00:00Z'));

    expect(created).toMatchObject({
      ticketId: ticket.id,
      body: 'Imported comment',
      createdAt: '2026-01-01T00:00:00.000Z',
      author: { id: owner.id, username: owner.name, avatar_url: owner.avatarUrl, role: owner.role },
    });
    // The mutation performs an INSERT and one bounded read, irrespective of
    // discussion length. Count returned rows so a full-thread read regresses.
    expect(querySpy).toHaveBeenCalledTimes(2);
    const readback = await querySpy.mock.results[1]!.value;
    expect(readback.rows).toHaveLength(1);
    querySpy.mockRestore();
    expect(await listComments(ticket.id)).toHaveLength(41);
  });

  it('reads only the updated comment and keeps readback scoped to its ticket', async () => {
    const { owner, project } = await seedWorkspaceFixture();
    const ticket = await seedTicket(project.id);
    await db.insert(comments).values([
      { id: 'comment-target', ticketId: ticket.id, userId: owner.id, body: 'Before' },
      { id: 'comment-other', ticketId: ticket.id, userId: owner.id, body: 'Unchanged' },
    ]);
    const querySpy = vi.spyOn(pool, 'query');

    expect(await updateCommentRecord('comment-target', ticket.id, 'After')).toMatchObject({
      id: 'comment-target', body: 'After',
    });
    expect(querySpy).toHaveBeenCalledTimes(2);
    const readback = await querySpy.mock.results[1]!.value;
    expect(readback.rows).toHaveLength(1);

    expect(await updateCommentRecord('comment-target', 'another-ticket', 'Wrong scope')).toBeNull();
    expect(await updateCommentRecord('', ticket.id, 'Missing comment')).toBeNull();
    expect(await listComments(ticket.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'comment-target', body: 'After' }),
      expect.objectContaining({ id: 'comment-other', body: 'Unchanged' }),
    ]));
  });
});
