import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db, pool } from '../../src/db/index.js';
import { tickets } from '../../src/db/schema.js';
import { migrateTicketKeyCounters } from '../../src/db/ticket-key-counters.js';
import { nextTicketKey } from '../../src/lib/platform.js';
import { createTicketRecord } from '../../src/modules/tickets/services/tickets.js';

// Called only by the guarded disposable-database runner, after its fixtures.
// Gates and pg_stat_activity establish actual lock contention, not timing luck.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function heldCreation(projectId: string, rollback = false) {
  const allocated = deferred<string>();
  const resume = deferred<void>();
  const result = db.transaction(async tx => {
    const key = await nextTicketKey(tx, projectId);
    allocated.resolve(key);
    await resume.promise;
    await tx.insert(tickets).values({ id: randomUUID(), key, title: 'Held creation', projectId });
    if (rollback) throw new Error('intentional rollback');
    return key;
  }).then(key => ({ key, error: undefined }), error => {
    allocated.reject(error);
    return { key: undefined, error };
  });
  return { allocated: allocated.promise, resume: () => resume.resolve(), result };
}

async function blockedQuery() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await pool.query(`SELECT query FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock' ORDER BY query_start LIMIT 1`);
    if (rows[0]) return String(rows[0].query);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Expected database lock contention was not observed');
}

export async function testTicketNumberRaces(projectId: string) {
  // Restart/backfill must wait at the ticket TABLE lock, not acquire it while
  // waiting for a counter already held by a writer that still needs tickets.
  const writer = heldCreation(projectId);
  await writer.allocated;
  const migration = migrateTicketKeyCounters(pool).then(() => undefined, error => error);
  let waitingMigration = '';
  try {
    waitingMigration = await blockedQuery();
  } finally {
    writer.resume();
    assert.equal((await writer.result).error, undefined);
    assert.equal(await migration, undefined);
  }
  assert.match(waitingMigration, /LOCK TABLE tickets IN SHARE ROW EXCLUSIVE MODE/);

  // An explicit import of an already allocated key must lose with a normal
  // unique-key error, never deadlock or cause the legitimate creator to fail.
  const reserved = heldCreation(projectId);
  const reservedKey = await reserved.allocated;
  const importer = pool.query(`INSERT INTO tickets (id, key, title, project_id)
    VALUES ($1, $2, 'Conflicting explicit import', $3)`, [randomUUID(), reservedKey, projectId])
    .then(() => undefined, error => error);
  let importError: { code?: string } | undefined;
  try {
    assert.match(await blockedQuery(), /INSERT INTO tickets/);
  } finally {
    reserved.resume();
    assert.equal((await reserved.result).error, undefined);
    importError = await importer;
  }
  assert.equal(importError?.code, '23505');

  // Concurrent waiters may use an uncommitted, rolled-back allocation. It was
  // never published as an identity. Committed/deleted identities stay reserved.
  const aborted = heldCreation(projectId, true);
  const uncommittedKey = await aborted.allocated;
  const waiter = db.transaction(tx => nextTicketKey(tx, projectId))
    .then(key => ({ key, error: undefined }), error => ({ key: undefined, error }));
  try {
    assert.match(await blockedQuery(), /INSERT INTO ticket_key_counters/);
  } finally {
    aborted.resume();
    assert.match(String((await aborted.result).error), /intentional rollback/);
  }
  const next = await waiter;
  assert.equal(next.error, undefined);
  assert.equal(next.key, uncommittedKey);

  // A failed first creation removes its newly inserted counter on rollback.
  await pool.query("UPDATE projects SET key = 'ROLLBACK-FIRST' WHERE id = $1", [projectId]);
  await assert.rejects(createTicketRecord({ projectId, title: 'Invalid labels', labelIds: ['missing-label'] }));
  assert.equal((await pool.query("SELECT * FROM ticket_key_counters WHERE prefix = 'ROLLBACK-FIRST'")).rowCount, 0);
  assert.equal((await createTicketRecord({ projectId, title: 'First committed ticket' })).key, 'ROLLBACK-FIRST-1');

  // Renaming a project while a creator is waiting on its project row must use
  // the new prefix after lock acquisition, not an earlier prefetched key.
  const renamer = await pool.connect();
  let creation: Promise<Awaited<ReturnType<typeof createTicketRecord>>> | undefined;
  try {
    await renamer.query('BEGIN');
    await renamer.query("UPDATE projects SET key = 'RENAMED-PROJECT' WHERE id = $1", [projectId]);
    creation = createTicketRecord({ projectId, title: 'After concurrent rename' });
    assert.match(await blockedQuery(), /"projects".*for update/i);
    await renamer.query('COMMIT');
    assert.equal((await creation).key, 'RENAMED-PROJECT-1');
  } finally {
    await renamer.query('ROLLBACK');
    renamer.release();
    await creation;
  }
  await pool.query("UPDATE projects SET key = 'ROLLBACK-FIRST' WHERE id = $1", [projectId]);
  assert.equal((await createTicketRecord({ projectId, title: 'Reused prefix' })).key, 'ROLLBACK-FIRST-2');

  // Moving the highest explicit key to another prefix cannot release the old
  // prefix. The trigger reserves the new prefix without recursively inserting.
  await pool.query(`INSERT INTO tickets (id, key, title, project_id)
    VALUES ('renumbered', 'OLD-HIGH-500', 'Renumbered import', $1)`, [projectId]);
  await pool.query("UPDATE tickets SET key = 'NEW-HIGH-700' WHERE id = 'renumbered'");
  await pool.query("DELETE FROM tickets WHERE id = 'renumbered'");
  for (const [prefix, expected] of [['OLD-HIGH', 'OLD-HIGH-501'], ['NEW-HIGH', 'NEW-HIGH-701']]) {
    await pool.query('UPDATE projects SET key = $1 WHERE id = $2', [prefix, projectId]);
    assert.equal((await createTicketRecord({ projectId, title: 'Retained identity' })).key, expected);
  }

  // Exhaustion must fail atomically, never wrap, round, or emit a reused key.
  await pool.query("UPDATE projects SET key = 'EXHAUSTED' WHERE id = $1", [projectId]);
  await pool.query("INSERT INTO ticket_key_counters VALUES ('EXHAUSTED', 9223372036854775807)");
  await assert.rejects(createTicketRecord({ projectId, title: 'Cannot wrap' }),
    (error: any) => error.cause?.code === '22003');
  assert.equal((await pool.query("SELECT last_value FROM ticket_key_counters WHERE prefix = 'EXHAUSTED'")).rows[0].last_value, '9223372036854775807');
  assert.equal((await pool.query("SELECT * FROM tickets WHERE title = 'Cannot wrap'")).rowCount, 0);
}
