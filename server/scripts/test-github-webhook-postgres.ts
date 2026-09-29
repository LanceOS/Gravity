/** Run with DATABASE_URL pointing at a disposable gravity_webhook_test_* database.
 * Unlike pg-mem, PostgreSQL exercises real unique-key blocking, row locks and rollback.
 * The caller owns creation/removal of the isolated database. No containers are started.
 */
import assert from 'node:assert/strict';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (!/^\/gravity_webhook_test_[a-z0-9_]+$/.test(url.pathname)) {
  throw new Error('DATABASE_URL must name a disposable gravity_webhook_test_* database.');
}
process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';
process.env.BETTER_AUTH_SECRET ??= 'webhook-test-secret';
process.env.NODE_IDENTITY_MASTER_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const { initializeDatabase } = await import('../src/db/bootstrap.js');
const { db, pool } = await import('../src/db/index.js');
const { projects, teams, tickets, workspaces } = await import('../src/db/schema.js');
const { processPullRequestEvent } = await import('../src/modules/webhooks/processPullRequest.js');
const repoUrl = 'https://github.com/test/atomic';
const input = {
  deliveryId: 'concurrent-open', action: 'opened', repoUrl, prUrl: `${repoUrl}/pull/1`, number: 1,
  title: 'TEST-1', branch: '', merged: false, sourceUpdatedAt: new Date('2026-09-29T12:00:00Z'),
  externalAuthor: 'author', externalSender: 'sender',
};
try {
  await initializeDatabase();
  await db.insert(workspaces).values({ id: 'w', name: 'Test', key: 'TEST', workspaceKey: 'test', createdBy: 'test' });
  await db.insert(teams).values({ id: 'team', workspaceId: 'w', name: 'Test' });
  await db.insert(projects).values({ id: 'p', workspaceId: 'w', teamId: 'team', name: 'Test', key: 'TEST', inviteCode: 'test', createdBy: 'test', githubRepoUrl: repoUrl });
  await db.insert(tickets).values([
    { id: 't1', key: 'TEST-1', title: 'Test', projectId: 'p' },
    { id: 't2', key: 'TEST-2', title: 'Dependent', projectId: 'p' },
  ]);
  const results = await Promise.all(Array.from({ length: 12 }, () => processPullRequestEvent(input)));
  assert.equal(results.flat().length, 1);
  assert.equal((await pool.query('SELECT * FROM comments')).rowCount, 1);
  assert.equal((await pool.query('SELECT * FROM github_deliveries')).rowCount, 1);

  // A failure after the ticket/PR/dependency writes must undo the delivery claim too.
  await pool.query("INSERT INTO ticket_relationships (ticket_id, blocked_ticket_id, project_id) VALUES ('t1', 't2', 'p')");
  await pool.query(`CREATE FUNCTION reject_comment() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected comment failure'; END $$;
    CREATE TRIGGER reject_comment BEFORE INSERT ON comments FOR EACH ROW EXECUTE FUNCTION reject_comment();`);
  const merge = { ...input, deliveryId: 'merge', action: 'closed', merged: true, sourceUpdatedAt: new Date('2026-09-30') };
  await assert.rejects(processPullRequestEvent(merge));
  assert.equal((await pool.query("SELECT status FROM tickets WHERE id = 't1'")).rows[0].status, 'in_progress');
  assert.equal((await pool.query("SELECT status FROM ticket_pull_requests WHERE ticket_id = 't1'")).rows[0].status, 'open');
  assert.equal((await pool.query("SELECT * FROM github_deliveries WHERE id = 'merge'")).rowCount, 0);
  assert.equal((await pool.query('SELECT * FROM ticket_relationships')).rowCount, 1);
  assert.equal((await pool.query('SELECT * FROM comments')).rowCount, 1);
  await pool.query('DROP TRIGGER reject_comment ON comments; DROP FUNCTION reject_comment()');
  assert.equal((await processPullRequestEvent(merge)).length, 2);
  assert.equal((await pool.query("SELECT status FROM tickets WHERE id = 't1'")).rows[0].status, 'done');
  assert.equal((await pool.query('SELECT * FROM ticket_relationships')).rowCount, 0);

  // Concurrent distinct PRs must see each other's state after acquiring project locks.
  const secondTicket = { ...input, title: 'TEST-2' };
  await Promise.all([2, 3].map(number => processPullRequestEvent({ ...secondTicket,
    deliveryId: `open-${number}`, number, prUrl: `${repoUrl}/pull/${number}`,
  })));
  assert.equal((await pool.query("SELECT * FROM ticket_pull_requests WHERE ticket_id = 't2'")).rowCount, 2);
  await processPullRequestEvent({ ...secondTicket, action: 'closed', merged: true, deliveryId: 'merge-2', number: 2, prUrl: `${repoUrl}/pull/2` });
  assert.equal((await pool.query("SELECT status FROM tickets WHERE id = 't2'")).rows[0].status, 'in_progress');
  await Promise.all([
    processPullRequestEvent({ ...secondTicket, action: 'closed', merged: true, deliveryId: 'merge-3', number: 3, prUrl: `${repoUrl}/pull/3` }),
    processPullRequestEvent({ ...secondTicket, deliveryId: 'stale-2', number: 2, prUrl: `${repoUrl}/pull/2` }),
  ]);
  assert.equal((await pool.query("SELECT status FROM tickets WHERE id = 't2'")).rows[0].status, 'done');
  console.log('PostgreSQL webhook checks passed: concurrent deduplication, atomic rollback/retry, multiple PR ordering.');
} finally {
  await pool.end();
}
