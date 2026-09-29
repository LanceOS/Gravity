import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { tickets } from '../src/db/schema.js';
import { TicketTools } from '../src/modules/tickets/mcp.js';
import { createTicketRecord } from '../src/modules/tickets/services/tickets.js';
import { seedWorkspaceFixture } from './helpers/test-helpers.js';

async function fixture() {
  const base = await seedWorkspaceFixture();
  const context = { workspaceId: base.workspace.id, actorUserId: base.owner.id };
  const tools = new TicketTools();
  const add = (day: number) => createTicketRecord({ projectId: base.project.id, title: `Ticket ${day}`, createdAt: new Date(Date.UTC(2026, 8, day)) });
  return { ...base, context, tools, add };
}

describe('MCP ticket search keyset pagination', () => {
  it.each(['asc', 'desc'])('keeps %s pages stable across insertions, deletions and timestamp ties', async order => {
    const f = await fixture();
    await f.add(1);
    await f.add(2);
    await f.add(2);
    await f.add(3);
    const args = { projectId: f.project.id, order, limit: 2 };
    const original = await f.tools.searchTickets({ ...args, limit: 100 }, f.context);
    const first = await f.tools.searchTickets(args, f.context);
    expect(first.tickets.map(t => t.id)).toEqual(original.tickets.slice(0, 2).map(t => t.id));
    // Delete the anchor itself and insert before it: neither operation shifts the next page.
    await db.delete(tickets).where(eq(tickets.id, first.tickets[1].id));
    await f.add(order === 'asc' ? 0 : 4);
    const next = await f.tools.searchTickets({ ...args, cursor: first.nextCursor }, f.context);
    expect(next.tickets.map(t => t.id)).toEqual(original.tickets.slice(2).map(t => t.id));
    expect(next.nextCursor).toBeNull();
  });

  it('retrieves the newest ticket directly and preserves default ascending and list offset behavior', async () => {
    const f = await fixture();
    const oldest = await f.add(1);
    const newest = await f.add(3);
    await f.add(2);
    expect((await f.tools.searchTickets({ order: 'desc', limit: 1 }, f.context)).tickets[0].id).toBe(newest.id);
    expect((await f.tools.searchTickets({ limit: 1 }, f.context)).tickets[0].id).toBe(oldest.id);
    expect((await f.tools.listTickets({ offset: 2, limit: 1 }, f.context))[0].id).toBe(newest.id);
  });

  it('binds cursors to filters, order and workspace, but permits changing page size', async () => {
    const f = await fixture();
    await f.add(1); await f.add(2); await f.add(3);
    const args = { projectId: f.project.id, limit: 1 };
    const first = await f.tools.searchTickets(args, f.context);
    const cursor = first.nextCursor!;
    expect(JSON.parse(Buffer.from(cursor, 'base64url').toString())).toMatchObject({ version: 1 });
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    for (const change of [{ version: 2 }, { id: '' }, { createdAt: 'invalid' }]) {
      const invalid = Buffer.from(JSON.stringify({ ...decoded, ...change })).toString('base64url');
      await expect(f.tools.searchTickets({ ...args, cursor: invalid }, f.context)).rejects.toThrow('Invalid ticket search cursor');
    }
    for (const change of [{ order: 'desc' }, { query: 'other' }, { status: 'done' }, { projectId: undefined }, { parentId: null }, { labelIds: ['other'] }, { updatedAfter: '2026-01-01' }]) {
      await expect(f.tools.searchTickets({ ...args, ...change, cursor }, f.context)).rejects.toThrow('Invalid ticket search cursor');
    }
    await expect(f.tools.searchTickets({ cursor }, { ...f.context, workspaceId: 'foreign' })).rejects.toThrow('Invalid ticket search cursor');
    const next = await f.tools.searchTickets({ ...args, limit: 100, cursor }, f.context);
    expect(next.tickets).toHaveLength(2);
    expect(next.nextCursor).toBeNull();
    await expect(f.tools.searchTickets({ projectId: 'foreign' }, f.context)).rejects.toThrow();
  });

  it('accepts equivalent normalized filters and keeps the response JSON compatible', async () => {
    const f = await fixture();
    await f.add(1); await f.add(2);
    const first = await f.tools.searchTickets({ query: ' Ticket ', createdAfter: '2026-08-01', labels: '', limit: 1 }, f.context);
    const next = await f.tools.searchTickets({ query: 'Ticket', createdAfter: '2026-08-01T00:00:00.000Z', labelIds: [], order: 'asc', labelMode: 'any', cursor: first.nextCursor }, f.context);
    expect(next.tickets).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
    expect(Object.keys(JSON.parse(JSON.stringify(first))).sort()).toEqual(['nextCursor', 'scope', 'tickets']);
    expect(JSON.stringify(first.tickets)).not.toContain('cursor_created_at');
  });

  it('rejects malformed, unsupported and legacy cursors and enforces page bounds', async () => {
    const f = await fixture();
    for (const cursor of ['bad', '', Buffer.from(JSON.stringify({ offset: 1 })).toString('base64url'), Buffer.from('null').toString('base64url')]) {
      await expect(f.tools.searchTickets({ cursor }, f.context)).rejects.toThrow('Invalid ticket search cursor');
    }
    for (const limit of [0, -1, 101, 1.5]) await expect(f.tools.searchTickets({ limit }, f.context)).rejects.toThrow();
    await expect(f.tools.searchTickets({ order: 'invalid' }, f.context)).rejects.toThrow('order must be');
    expect(await f.tools.searchTickets({}, f.context)).toMatchObject({ tickets: [], nextCursor: null });
  });
});
