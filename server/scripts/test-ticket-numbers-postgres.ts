/** Uses only an EMPTY, disposable gravity_ticket_numbers_test_* database.
 * The caller creates/removes that database on an existing PostgreSQL server.
 * Never run against application data. No Docker or external-service operations.
 */
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (!/^\/gravity_ticket_numbers_test_[a-z0-9_]+$/.test(url.pathname)) {
  throw new Error('Use an empty disposable gravity_ticket_numbers_test_* database.');
}
process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';
process.env.ALLOW_DEV_AUTH_BYPASS = 'true';
process.env.BETTER_AUTH_SECRET ??= 'ticket-numbers-postgres-test-secret';
process.env.LOCAL_TESTING_KEK ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.NODE_IDENTITY_MASTER_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const { db, pool } = await import('../src/db/index.js');
const { initializeDatabase } = await import('../src/db/bootstrap.js');
const { migrateTicketKeyCounters } = await import('../src/db/ticket-key-counters.js');
const schema = await import('../src/db/schema.js');
const { nextTicketKey } = await import('../src/lib/platform.js');
const { createTicketRecord, deleteTicketRecord } = await import('../src/modules/tickets/services/tickets.js');
const { bootstrapMcpRegistries } = await import('../src/modules/mcp/bootstrap.js');
const { executeTool } = await import('../src/modules/mcp/tool-executor.js');
const { createApp } = await import('../src/app.js');

try {
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)).rows[0].count, 0,
  'Refusing to modify a nonempty database');
  await initializeDatabase();
  await db.insert(schema.authUsers).values({ id: 'actor', name: 'Test', email: 'ticket-test@example.com', emailVerified: true, image: '', tutorial_completed: true, createdAt: new Date(), updatedAt: new Date() });
  for (const suffix of ['a', 'b']) {
    await db.insert(schema.workspaces).values({ id: `w-${suffix}`, name: 'Test', key: `W${suffix}`, workspaceKey: suffix, createdBy: 'actor' });
    await db.insert(schema.workspaceMembers).values({ workspaceId: `w-${suffix}`, userId: 'actor', role: 'owner' });
    await db.insert(schema.workspaceSettings).values({ workspaceId: `w-${suffix}` });
    await db.insert(schema.teams).values({ id: `team-${suffix}`, workspaceId: `w-${suffix}`, name: 'Test' });
    await db.insert(schema.projects).values({ id: `p-${suffix}`, workspaceId: `w-${suffix}`, teamId: `team-${suffix}`, name: 'Test', key: 'SAME', inviteCode: suffix, createdBy: 'actor' });
  }
  const create = (title = 'Service batch', projectId = 'p-a') => createTicketRecord({ title, projectId });

  // Exercise concurrent creation of a previously absent counter as well as
  // updates of an existing counter in the mixed-entry-point test below.
  await pool.query("UPDATE projects SET key = 'FRESH'");
  const fresh = await Promise.all(Array.from({ length: 20 }, (_, index) => create('First batch', index % 2 ? 'p-a' : 'p-b')));
  assert.equal(new Set(fresh.map(ticket => ticket.key)).size, 20);
  assert.deepEqual(fresh.map(ticket => Number(ticket.key.split('-').at(-1))).sort((a, b) => a - b),
    Array.from({ length: 20 }, (_, index) => index + 1));
  await pool.query("UPDATE projects SET key = 'SAME'");

  // Simulate pre-upgrade keys, including a moved ticket whose prefix differs
  // from the current project, and numbers outside JavaScript's safe integers.
  await pool.query('DROP TRIGGER tickets_reserve_key_number ON tickets');
  await db.insert(schema.tickets).values([
    { id: 'legacy', key: 'SAME-71', title: 'Legacy', projectId: 'p-a' },
    { id: 'moved', key: 'OLD-PREFIX-800', title: 'Moved', projectId: 'p-b' },
    { id: 'large', key: 'BIG-9007199254740993', title: 'Large', projectId: 'p-b' },
    { id: 'empty-prefix', key: '-17', title: 'Legacy empty prefix', projectId: 'p-b' },
    { id: 'unusual-prefix', key: 'A_%\nB-42', title: 'Legacy unusual prefix', projectId: 'p-b' },
    { id: 'non-numeric', key: 'SAME-nonnumeric', title: 'Non numeric', projectId: 'p-a' },
  ]);
  await migrateTicketKeyCounters(pool);
  assert.equal((await create()).key, 'SAME-72');
  assert.equal((await pool.query("SELECT last_value FROM ticket_key_counters WHERE prefix = 'OLD-PREFIX'")).rows[0].last_value, '800');
  await pool.query("UPDATE projects SET key = 'BIG' WHERE id = 'p-b'");
  assert.equal((await create('Large exact number', 'p-b')).key, 'BIG-9007199254740994');
  for (const [prefix, expected] of [['  ', '-18'], ['A_%\nB', 'A_%\nB-43']]) {
    await pool.query('UPDATE projects SET key = $1 WHERE id = $2', [prefix, 'p-b']);
    assert.equal((await create('Historical prefix compatibility', 'p-b')).key, expected);
  }
  await pool.query("UPDATE projects SET key = 'SAME' WHERE id = 'p-b'");

  // All entry points share the same allocator. Batch service calls represent
  // parallel bulk creation; there is no separate bulk-create HTTP endpoint.
  bootstrapMcpRegistries();
  const app = createApp();
  const results = await Promise.all(Array.from({ length: 36 }, async (_, index) => {
    const projectId = index % 2 ? 'p-a' : 'p-b';
    const workspaceId = index % 2 ? 'w-a' : 'w-b';
    if (index % 3 === 0) {
      const response = await request(app).post('/api/v1/tickets')
        .set('x-user-id', 'actor').set('x-project-id', projectId)
        .send({ title: `REST ${index}`, projectId });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      return response.body;
    }
    if (index % 3 === 1) {
      const result = await executeTool('create_ticket', { title: `MCP ${index}`, projectId }, workspaceId, 'actor') as { ticket: { key: string; id: string } };
      return result.ticket;
    }
    return create(`Bulk ${index}`, projectId);
  }));
  assert.equal(new Set(results.map(ticket => ticket.key)).size, 36);
  assert.equal(new Set(results.map(ticket => ticket.id)).size, 36);
  assert.deepEqual(results.map(ticket => Number(ticket.key.split('-').at(-1))).sort((a, b) => a - b),
    Array.from({ length: 36 }, (_, index) => index + 73));

  const highest = await create('Delete me');
  await deleteTicketRecord(highest.id, 'p-a');
  await migrateTicketKeyCounters(pool); // Restart/repeated migration cannot lower the counter.
  assert.equal((await create()).key, 'SAME-110');

  // Fail after allocation and INSERT, verifying both changes roll back.
  const beforeFailure = (await pool.query("SELECT last_value FROM ticket_key_counters WHERE prefix = 'SAME'")).rows[0].last_value;
  await assert.rejects(createTicketRecord({ projectId: 'p-a', title: 'Must roll back', labelIds: ['missing-label'] }));
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM tickets WHERE title = 'Must roll back'")).rows[0].count, 0);
  assert.equal((await pool.query("SELECT last_value FROM ticket_key_counters WHERE prefix = 'SAME'")).rows[0].last_value, beforeFailure);
  assert.equal((await create()).key, 'SAME-111');

  // Explicit imports advance the high water mark even if later deleted.
  await db.insert(schema.tickets).values({ id: 'imported', key: 'SAME-900', title: 'Import', projectId: 'p-b' });
  await pool.query("DELETE FROM tickets WHERE id = 'imported'");
  assert.equal((await create()).key, 'SAME-901');
  await pool.query("UPDATE tickets SET key = 'RENAMED-5000' WHERE id = 'legacy'");
  await pool.query("DELETE FROM tickets WHERE id = 'legacy'; UPDATE projects SET key = 'RENAMED' WHERE id = 'p-b'");
  assert.equal((await create('After explicit key update', 'p-b')).key, 'RENAMED-5001');
  // Deleting every ticket and both projects must still preserve the namespace.
  await pool.query("DELETE FROM tickets; DELETE FROM projects;");
  await db.insert(schema.projects).values({ id: 'replacement', workspaceId: 'w-a', teamId: 'team-a', name: 'Recreated', key: 'SAME', inviteCode: 'replacement', createdBy: 'actor' });
  assert.equal((await create('After project recreation', 'replacement')).key, 'SAME-902');

  // Assert a fixed three-query allocator with at most one row per query, before
  // and after growth. EXPLAIN verifies the conflict arbiter uses the primary key.
  const logged: string[] = [];
  const measuredDb = drizzle(pool, { schema, logger: { logQuery(query) { logged.push(query); } } });
  async function boundedAllocation() {
    await measuredDb.transaction(async tx => {
      logged.length = 0;
      const key = await nextTicketKey(tx, 'replacement');
      assert.match(key, /^SAME-\d+$/);
      assert.equal(logged.length, 3);
      assert.match(logged[0], /from "projects".*limit/);
      assert.match(logged[1], /LOCK TABLE tickets IN ROW EXCLUSIVE MODE/);
      assert.match(logged[2], /INSERT INTO ticket_key_counters/);
      assert.ok(logged.every(query => !/\b(?:FROM|JOIN)\s+"?tickets\b/i.test(query)), 'Allocator must not read tickets');
    });
  }
  await boundedAllocation();
  await pool.query(`INSERT INTO tickets (id, key, title, project_id)
    SELECT 'volume-' || n, 'SAME-' || (10000 + n), 'Volume', 'replacement' FROM generate_series(1, 10000) n`);
  await boundedAllocation();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const plan = await client.query(`EXPLAIN (ANALYZE, FORMAT JSON)
      INSERT INTO ticket_key_counters (prefix, last_value) VALUES ('SAME', 1)
      ON CONFLICT (prefix) DO UPDATE SET last_value = ticket_key_counters.last_value + 1 RETURNING last_value`);
    const root = plan.rows[0]['QUERY PLAN'][0].Plan;
    assert.deepEqual(root['Conflict Arbiter Indexes'], ['ticket_key_counters_pkey']);
    assert.equal(root['Conflicting Tuples'], 1);
    assert.equal(root['Actual Rows'], 1);
    assert.ok(!JSON.stringify(root).includes('"Relation Name":"tickets"'));
    await client.query('ROLLBACK');
  } finally { client.release(); }
  const { testTicketNumberRaces } = await import('./helpers/ticket-number-races.js');
  await testTicketNumberRaces('replacement');
  console.log('PostgreSQL ticket numbering passed: 36 concurrent REST/MCP/bulk writes, global prefixes, backfill, exact bigint, deletion/recreation, rollback, import, restart, bounded queries at 10,000 tickets, forced migration/import/rollback/rename races, bigint exhaustion.');
} finally {
  await pool.end();
}
