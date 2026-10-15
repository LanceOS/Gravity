/** Run only against a fresh disposable gravity_ticket_dependency_test_296 database. */
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (url.pathname !== '/gravity_ticket_dependency_test_296') {
  throw new Error('Use only a fresh gravity_ticket_dependency_test_296 database.');
}
process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';
process.env.BETTER_AUTH_SECRET ??= 'synthetic-dependency-workspace-test-secret';
process.env.LOCAL_TESTING_KEK ??= '01'.repeat(32);
process.env.NODE_IDENTITY_MASTER_KEY ??= '02'.repeat(32);

const { pool } = await import('../dist/db/index.js');
const { initializeDatabase } = await import('../dist/db/bootstrap.js');
const { removeCrossWorkspaceTicketRelationships } = await import('../dist/db/relationship-integrity.js');
const { createTicketDependencyRelation, TICKET_DEPENDENCY_WORKSPACE_CONFLICT } = await import('../dist/modules/tickets/services/tickets.js');
const query = (statement) => pool.query(statement);

try {
  const existing = await query(`SELECT count(*)::int AS count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`);
  assert.equal(existing.rows[0].count, 0, 'Refusing to modify a nonempty database');
  await initializeDatabase();
  await query(`
    INSERT INTO workspaces (id, name, key, workspace_key, created_by) VALUES
      ('dep-wa', 'A', 'DWA', 'WS-DWA', 'test-actor'),
      ('dep-wb', 'B', 'DWB', 'WS-DWB', 'test-actor');
    INSERT INTO teams (id, workspace_id, name) VALUES
      ('dep-ta', 'dep-wa', 'A'), ('dep-tb', 'dep-wb', 'B');
    INSERT INTO projects (id, workspace_id, team_id, name, key, invite_code, created_by) VALUES
      ('dep-pa', 'dep-wa', 'dep-ta', 'A', 'DPA', 'INV-DPA', 'test-actor'),
      ('dep-pc', 'dep-wa', 'dep-ta', 'C', 'DPC', 'INV-DPC', 'test-actor'),
      ('dep-pb', 'dep-wb', 'dep-tb', 'B', 'DPB', 'INV-DPB', 'test-actor');
    INSERT INTO tickets (id, key, title, project_id) VALUES
      ('dep-a1', 'DPA-1', 'A1', 'dep-pa'),
      ('dep-a2', 'DPA-2', 'A2', 'dep-pa'),
      ('dep-a3', 'DPA-3', 'A3', 'dep-pa'),
      ('dep-c1', 'DPC-1', 'C1', 'dep-pc'),
      ('dep-b1', 'DPB-1', 'B1', 'dep-pb');
  `);

  await createTicketDependencyRelation('dep-a1', 'dep-c1', 'dep-pa', 'dep-wa');
  await assert.rejects(
    createTicketDependencyRelation('dep-a1', 'dep-b1', 'dep-pa', 'dep-wa'),
    new RegExp(TICKET_DEPENDENCY_WORKSPACE_CONFLICT),
  );

  const mover = await pool.connect();
  try {
    await mover.query('BEGIN');
    await mover.query("UPDATE projects SET workspace_id = 'dep-wb' WHERE id = 'dep-pa'");
    let settled = false;
    const insertion = createTicketDependencyRelation('dep-a2', 'dep-a3', 'dep-pa', 'dep-wa')
      .finally(() => { settled = true; });
    await delay(150);
    assert.equal(settled, false, 'Insertion should wait for the project ownership lock');
    await mover.query('COMMIT');
    await assert.rejects(insertion, new RegExp(TICKET_DEPENDENCY_WORKSPACE_CONFLICT));
  } finally {
    await mover.query('ROLLBACK').catch(() => {});
    mover.release();
  }
  const raced = await query("SELECT count(*)::int AS count FROM ticket_relationships WHERE ticket_id = 'dep-a2' AND blocked_ticket_id = 'dep-a3'");
  assert.equal(raced.rows[0].count, 0);
  await query("UPDATE projects SET workspace_id = 'dep-wa' WHERE id = 'dep-pa'");

  await query(`
    INSERT INTO tickets (id, key, title, project_id)
    SELECT 'dep-source-' || n, 'DPA-' || (n + 10), 'Source ' || n, 'dep-pa'
    FROM generate_series(1, 11) AS n;
    INSERT INTO tickets (id, key, title, project_id)
    SELECT 'dep-target-' || n, 'DPB-' || (n + 10), 'Target ' || n, 'dep-pb'
    FROM generate_series(1, 10) AS n;
    INSERT INTO ticket_relationships (ticket_id, blocked_ticket_id, project_id)
    SELECT source.id, target.id, 'dep-pa'
    FROM tickets AS source CROSS JOIN tickets AS target
    WHERE source.id LIKE 'dep-source-%' AND target.id LIKE 'dep-target-%';
  `);
  assert.equal(await removeCrossWorkspaceTicketRelationships(), 110);
  assert.equal(await removeCrossWorkspaceTicketRelationships(), 0);
  const remaining = await query('SELECT ticket_id, blocked_ticket_id FROM ticket_relationships');
  assert.deepEqual(remaining.rows, [{ ticket_id: 'dep-a1', blocked_ticket_id: 'dep-c1' }]);
  console.log('PostgreSQL dependency workspace checks passed: concurrent ownership change rejected, 110 invalid edges removed, valid edge preserved.');
} finally {
  await pool.end();
}
