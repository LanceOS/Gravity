import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/index.js';
import { migrateLegacyTicketDependenciesTable } from '../src/db/bootstrap.js';

describe('initializeDatabase', () => {
  it('merges legacy ticket_dependencies into a canonical ticket_relationships table missing backfilled columns', async () => {
    await pool.query('ALTER TABLE ticket_relationships DROP COLUMN IF EXISTS project_id;');
    await pool.query('ALTER TABLE ticket_relationships DROP COLUMN IF EXISTS created_at;');
    await pool.query('DROP TABLE IF EXISTS ticket_dependencies CASCADE;');

    await pool.query(`
      INSERT INTO tickets (id, key, title, project_id, created_at, updated_at)
      VALUES
        ('ti-bootstrap-1', 'BOOT-1', 'Bootstrap blocker', 'project-bootstrap', NOW(), NOW()),
        ('ti-bootstrap-2', 'BOOT-2', 'Bootstrap dependent', 'project-bootstrap', NOW(), NOW())
    `);

    await pool.query(`
      CREATE TABLE ticket_dependencies (
        ticket_id TEXT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
        blocked_ticket_id TEXT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
        PRIMARY KEY (ticket_id, blocked_ticket_id)
      )
    `);

    await pool.query(`
      INSERT INTO ticket_dependencies (ticket_id, blocked_ticket_id)
      VALUES ('ti-bootstrap-1', 'ti-bootstrap-2')
    `);

    await expect(migrateLegacyTicketDependenciesTable()).resolves.toBeUndefined();

    const migratedRows = await pool.query(`
      SELECT ticket_id, blocked_ticket_id, project_id, created_at
      FROM ticket_relationships
      WHERE ticket_id = 'ti-bootstrap-1'
        AND blocked_ticket_id = 'ti-bootstrap-2'
    `);

    expect(migratedRows.rows).toEqual([
      {
        ticket_id: 'ti-bootstrap-1',
        blocked_ticket_id: 'ti-bootstrap-2',
        project_id: 'default',
        created_at: expect.anything(),
      },
    ]);

    const legacyTableCheck = await pool.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'ticket_dependencies'
      LIMIT 1
    `);

    expect(legacyTableCheck.rowCount ?? 0).toBe(0);
  });
});
