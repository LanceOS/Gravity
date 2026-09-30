import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (!/^\/gravity_ticket_subtrees_test_[a-z0-9_]+$/.test(url.pathname)) {
  throw new Error('Use an empty disposable gravity_ticket_subtrees_test_* database.');
}
process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';
process.env.BETTER_AUTH_SECRET = 'synthetic-ticket-subtrees-test-secret';
process.env.LOCAL_TESTING_KEK = '01'.repeat(32);
process.env.NODE_IDENTITY_MASTER_KEY = '02'.repeat(32);
const { pool } = await import('../src/db/index.js');
const { initializeDatabase } = await import('../src/db/bootstrap.js');
const { deleteTicketRecord, deleteTicketRecordWithEffects, updateTicketRecord } = await import('../src/modules/tickets/services/tickets.js');
const query = (sql: string, values?: unknown[]) => pool.query(sql, values);
const count = async (table: string) => Number((await query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count);
const snapshot = async () => {
  const result: Record<string, unknown> = {};
  for (const table of ['tickets', 'comments', 'ticket_labels', 'ticket_relationships']) {
    result[table] = (await query(`SELECT * FROM ${table} ORDER BY 1, 2`)).rows;
  }
  return result;
};
const seed = async () => {
  await query('TRUNCATE tickets, comments, ticket_labels, ticket_relationships CASCADE');
  await query(`INSERT INTO tickets (id, key, title, project_id, parent_id) VALUES
    ('ancestor','TREE-1','Ancestor','a',NULL), ('root','TREE-2','Root','a','ancestor'),
    ('child','TREE-3','Child','a','root'), ('grandchild','TREE-4','Grandchild','a','child'),
    ('sibling','TREE-5','Sibling','a','ancestor'), ('outside','TREE-6','Outside','b',NULL)`);
  await query(`INSERT INTO comments (id,ticket_id,user_id,body,automation)
    SELECT id,id,'actor','Keep metadata', '{"provider":"github","deliveryId":"synthetic"}'::jsonb FROM tickets`);
  await query(`INSERT INTO ticket_labels (ticket_id,label_id) SELECT id,'label' FROM tickets`);
  await query(`INSERT INTO ticket_relationships(ticket_id,blocked_ticket_id,project_id) VALUES
    ('child','sibling','a'), ('sibling','grandchild','a'), ('ancestor','sibling','a')`);
};
try {
  assert.equal((await query(`SELECT count(*)::int AS count FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'`)).rows[0].count, 0,
  'Refusing to modify a nonempty database');
  await initializeDatabase();
  await query(`INSERT INTO workspaces(id,name,key,workspace_key,created_by) VALUES
    ('wa','A','WA','wa','actor'), ('wb','B','WB','wb','actor');
    INSERT INTO workspace_settings(workspace_id,hierarchy_mode) VALUES ('wa','teams'),('wb','teams');
    INSERT INTO teams(id,workspace_id,name) VALUES ('ta','wa','A'),('tb','wb','B');
    INSERT INTO projects(id,workspace_id,team_id,name,key,invite_code,created_by) VALUES
      ('a','wa','ta','A','A','a','actor'), ('b','wb','tb','B','B','b','actor'), ('c','wa','ta','C','C','c','actor');
    INSERT INTO labels(id,team_id,name) VALUES ('label','ta','Preserve definition')`);
  // Migration is safe alongside bootstrap and on repeat application.
  const migration = await readFile(new URL('../drizzle/0014_ticket_subtree_integrity.sql', import.meta.url), 'utf8');
  await query(migration);
  await query(migration);
  await seed();
  const before = await snapshot();
  assert.equal(await deleteTicketRecord('root', 'b'), false);
  assert.equal(await deleteTicketRecord('missing', 'a'), false);
  assert.deepEqual(await snapshot(), before);
  const effects = await deleteTicketRecordWithEffects('root', 'a');
  assert.deepEqual(effects?.deletedTickets.map(ticket => ticket.id).sort(), ['child','grandchild','root']);
  assert.equal(await count('labels'), 1);
  for (const table of ['tickets', 'comments', 'ticket_labels']) assert.equal(await count(table), 3);
  assert.equal(await count('ticket_relationships'), 1);
  assert.deepEqual((await query('SELECT id FROM tickets ORDER BY id')).rows.map(row => row.id), ['ancestor','outside','sibling']);
  assert.equal((await query("SELECT last_value FROM ticket_key_counters WHERE prefix='TREE'")).rows[0].last_value, '6');
  console.log('PASS three-level subtree, descendant content, incoming/outgoing relationships, survivors and counters');

  await seed();
  await query("UPDATE tickets SET project_id='b' WHERE id='grandchild'");
  const boundary = await snapshot();
  await assert.rejects(deleteTicketRecord('root', 'a'), /TICKET_PARENT_SCOPE_VIOLATION/);
  assert.deepEqual(await snapshot(), boundary);
  console.log('PASS cross-project/cross-workspace boundary fails atomically');

  await seed();
  await query(`CREATE FUNCTION fail_subtree_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF OLD.id='grandchild' THEN RAISE EXCEPTION 'synthetic delete failure'; END IF; RETURN OLD; END $$;
    CREATE TRIGGER fail_subtree_delete BEFORE DELETE ON tickets FOR EACH ROW EXECUTE FUNCTION fail_subtree_delete()`);
  const rollback = await snapshot();
  await assert.rejects(deleteTicketRecord('root', 'a'));
  assert.deepEqual(await snapshot(), rollback);
  await query('DROP TRIGGER fail_subtree_delete ON tickets');
  console.log('PASS partial failure restores all comments, labels, relationships and tickets');

  await query("UPDATE tickets SET parent_id='grandchild' WHERE id='root'");
  assert.equal(await deleteTicketRecord('root', 'a'), true);
  assert.equal(await count('tickets'), 3);
  console.log('PASS legacy cycle terminates and deletes atomically');

  await seed();
  for (const sql of [
    "INSERT INTO comments(id,ticket_id,user_id,body) VALUES ('bad','missing','actor','bad')",
    "INSERT INTO ticket_labels(ticket_id,label_id) VALUES ('missing','label')",
    "UPDATE tickets SET parent_id='missing' WHERE id='root'",
    "DELETE FROM tickets WHERE id='root'",
  ]) await assert.rejects(query(sql));
  await query("DELETE FROM tickets WHERE id='outside'");
  assert.equal((await query("SELECT * FROM comments WHERE ticket_id='outside'")).rowCount, 0);
  assert.equal((await query("SELECT * FROM ticket_labels WHERE ticket_id='outside'")).rowCount, 0);
  console.log('PASS foreign keys and direct-delete cascades');

  await seed();
  const gate = await pool.connect();
  await gate.query('SELECT pg_advisory_lock(241)');
  await query(`CREATE FUNCTION gate_subtree_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    PERFORM pg_advisory_xact_lock(241); RETURN OLD; END $$;
    CREATE TRIGGER gate_subtree_delete BEFORE DELETE ON comments FOR EACH STATEMENT EXECUTE FUNCTION gate_subtree_delete()`);
  const deletion = deleteTicketRecord('root', 'a');
  try {
    const deadline = Date.now() + 5000;
    while (!(await query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rowCount) {
      assert.ok(Date.now() < deadline, 'Deletion reached test gate');
      await delay(10);
    }
    const lateChild = query("INSERT INTO tickets(id,key,title,project_id,parent_id) VALUES ('late','TREE-7','Late','a','child')");
    const lateComment = query("INSERT INTO comments(id,ticket_id,user_id,body) VALUES ('late','grandchild','actor','Late')");
    const lateLabel = query("INSERT INTO ticket_labels(ticket_id,label_id) VALUES ('grandchild','late')");
    const rejected = [lateChild, lateComment, lateLabel].map(promise => assert.rejects(promise));
    const lateMove = updateTicketRecord('child', { projectId: 'c' }, 'a');
    const lateReparent = assert.rejects(updateTicketRecord('sibling', { parentId: 'root' }, 'a')); 
    while (Number((await query("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows[0].count) < 6) {
      assert.ok(Date.now() < deadline, 'Concurrent writes reached FK locks');
      await delay(10);
    }
    await gate.query('SELECT pg_advisory_unlock(241)');
    assert.equal(await deletion, true);
    await Promise.all(rejected);
    assert.equal(await lateMove, null);
    await lateReparent;
    assert.equal(await count('tickets'), 3);
    console.log('PASS concurrent inserts, reparenting and project moves serialize with deletion');
  } finally {
    await gate.query('SELECT pg_advisory_unlock_all()');
    gate.release();
    await deletion;
  }
  await query('DROP TRIGGER gate_subtree_delete ON comments');
  await seed();
  const moveGate = await pool.connect();
  await moveGate.query('SELECT pg_advisory_lock(242)');
  await query(`CREATE FUNCTION gate_ticket_move() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    PERFORM pg_advisory_xact_lock(242); RETURN NEW; END $$;
    CREATE TRIGGER gate_ticket_move BEFORE UPDATE OF project_id ON tickets FOR EACH ROW EXECUTE FUNCTION gate_ticket_move()`);
  const moving = updateTicketRecord('root', { projectId: 'c' }, 'a');
  let losingDelete: Promise<boolean> | undefined;
  try {
    const deadline = Date.now() + 5000;
    while (!(await query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rowCount) {
      assert.ok(Date.now() < deadline, 'Move reached test gate');
      await delay(10);
    }
    losingDelete = deleteTicketRecord('root', 'a');
    while (Number((await query("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows[0].count) < 2) {
      assert.ok(Date.now() < deadline, 'Delete waited for project lock');
      await delay(10);
    }
    await moveGate.query('SELECT pg_advisory_unlock(242)');
    assert.equal((await moving)?.projectId, 'c');
    assert.equal(await losingDelete, false);
    assert.equal(await count('tickets'), 6);
    assert.equal((await query("SELECT parent_id FROM tickets WHERE id='child'")).rows[0].parent_id, null);
    console.log('PASS project move winning first prevents deletion under stale authorization');
  } finally {
    await moveGate.query('SELECT pg_advisory_unlock_all()');
    moveGate.release();
    await moving;
    await losingDelete;
  }
  await query('DROP TRIGGER gate_ticket_move ON tickets');

  await query(`ALTER TABLE tickets DROP CONSTRAINT tickets_parent_id_tickets_id_fk;
    ALTER TABLE comments DROP CONSTRAINT comments_ticket_id_tickets_id_fk;
    ALTER TABLE ticket_labels DROP CONSTRAINT ticket_labels_ticket_id_tickets_id_fk;
    UPDATE tickets SET parent_id='legacy-missing' WHERE id='sibling';
    INSERT INTO comments(id,ticket_id,user_id,body) VALUES ('legacy','legacy-missing','actor','Preserve');
    INSERT INTO ticket_labels(ticket_id,label_id) VALUES ('legacy-missing','label')`);
  const legacy = await snapshot();
  await initializeDatabase();
  assert.deepEqual(await snapshot(), legacy);
  await query(migration);
  assert.deepEqual(await snapshot(), legacy);
  await assert.rejects(query("INSERT INTO comments(id,ticket_id,user_id,body) VALUES ('new','legacy-missing','actor','Reject')"));
  console.log('PASS upgrade retains legacy orphans while enforcing new references');
} finally {
  await pool.end();
}
