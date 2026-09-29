/** DATABASE_URL must name a disposable gravity_reconciliation_test_* database.
 * Uses existing PostgreSQL; the caller owns isolated database creation/removal.
 * GitHub is mocked. No containers, shared data or external repositories are changed.
 */
import assert from 'node:assert/strict';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (!/^\/gravity_reconciliation_test_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Use a disposable gravity_reconciliation_test_* database.');
process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';
process.env.BETTER_AUTH_SECRET ??= 'reconciliation-test-secret';
process.env.NODE_IDENTITY_MASTER_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const { initializeDatabase } = await import('../src/db/bootstrap.js');
const { db, pool } = await import('../src/db/index.js');
const { projects, teams, tickets, workspaces } = await import('../src/db/schema.js');
const { buildCandidates, signPlan, digest } = await import('../src/modules/github-reconciliation/preview.js');
const { applyReconciliation } = await import('../src/modules/github-reconciliation/apply.js');
const { fetchPullRequests } = await import('../src/modules/github-reconciliation/github.js');
const repoUrl = 'https://github.com/test/reconcile';
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify([{ number: 1, title: 'TEST-1', head: { ref: 'fix' }, state: 'closed', merged_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' }]));
try {
  await initializeDatabase();
  await db.insert(workspaces).values({ id: 'w', name: 'Test', key: 'TEST', workspaceKey: 'test', createdBy: 'test' });
  await db.insert(teams).values({ id: 'team', workspaceId: 'w', name: 'Test' });
  await db.insert(projects).values({ id: 'p', workspaceId: 'w', teamId: 'team', name: 'Test', key: 'TEST', inviteCode: 'test', createdBy: 'test', githubRepoUrl: repoUrl });
  await db.insert(tickets).values([
    { id: 't1', key: 'TEST-1', title: 'Test', projectId: 'p', updatedAt: new Date('2026-01-01') },
    { id: 't2', key: 'TEST-2', title: 'Dependent', projectId: 'p' },
  ]);
  await pool.query("INSERT INTO ticket_relationships (ticket_id, blocked_ticket_id, project_id) VALUES ('t1', 't2', 'p')");
  const scan = { startPage: 1, maxPages: 1 };
  async function preview() {
    const snapshot = await fetchPullRequests('test/reconcile', scan);
    const rows = await db.select().from(tickets);
    const candidates = buildCandidates(rows, snapshot.pulls, snapshot.incomplete);
    return signPlan({ version: 1, actorId: 'test', projectId: 'p', repo: 'test/reconcile', expiresAt: Date.now() + 60_000,
      scan, pullsDigest: digest([snapshot.pulls, snapshot.incomplete, snapshot.nextPage]), candidates });
  }
  const token = await preview();
  const apply = () => applyReconciliation('p', 'test', token, [{ candidateId: 't1:1', reviewed: false }]);
  await pool.query(`CREATE FUNCTION reject_comment() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected comment failure'; END $$;
    CREATE TRIGGER reject_comment BEFORE INSERT ON comments FOR EACH ROW EXECUTE FUNCTION reject_comment();`);
  assert.equal((await apply()).results[0].outcome, 'failed');
  assert.equal((await pool.query("SELECT status FROM tickets WHERE id = 't1'")).rows[0].status, 'todo');
  assert.equal((await pool.query('SELECT * FROM ticket_pull_requests')).rowCount, 0);
  assert.equal((await pool.query('SELECT * FROM comments')).rowCount, 0);
  assert.equal((await pool.query('SELECT * FROM ticket_relationships')).rowCount, 1);
  await pool.query('DROP TRIGGER reject_comment ON comments; DROP FUNCTION reject_comment()');
  const outcomes = (await Promise.all(Array.from({ length: 12 }, apply))).flatMap(result => result.results.map(row => row.outcome));
  assert.equal(outcomes.filter(outcome => outcome === 'applied').length, 1);
  assert.ok(outcomes.every(outcome => outcome === 'applied' || outcome === 'unchanged'));
  assert.equal((await pool.query('SELECT * FROM comments')).rowCount, 1);
  assert.equal((await pool.query('SELECT * FROM ticket_relationships')).rowCount, 0);
  // Restore the older ticket state while leaving the PR identity and activity intact.
  await pool.query("UPDATE tickets SET status = 'todo', pr_status = 'none', pr_url = NULL, updated_at = '2026-01-01' WHERE id = 't1'");
  const restored = await preview();
  assert.equal((await applyReconciliation('p', 'test', restored, [{ candidateId: 't1:1', reviewed: false }])).results[0].outcome, 'applied');
  // A manual update after a preview must win; no further activity is added.
  await pool.query("UPDATE tickets SET status = 'todo', pr_status = 'none', pr_url = NULL, updated_at = '2026-01-01' WHERE id = 't1'");
  const beforeManual = await preview();
  await pool.query("UPDATE tickets SET status = 'canceled', updated_at = now() WHERE id = 't1'");
  assert.equal((await applyReconciliation('p', 'test', beforeManual, [{ candidateId: 't1:1', reviewed: false }])).results[0].outcome, 'stale');
  assert.equal((await pool.query('SELECT * FROM comments')).rowCount, 2);
  console.log('PostgreSQL reconciliation checks passed: atomic rollback/retry, 12 concurrent applies, restore repair, manual edit protection.');
} finally {
  globalThis.fetch = originalFetch;
  await pool.end();
}
