import { describe, expect, it } from 'vitest';
import { db, pool } from '../src/db/index.js';
import { migrateLegacyCycleProjectConstraint, migrateLegacyTicketDependenciesTable } from '../src/db/bootstrap.js';
import { cycles } from '../src/db/schema.js';
import { seedWorkspaceFixture } from './helpers/test-helpers.js';

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

  it('leaves current cycle schemas without an obsolete project column unchanged', async () => {
    await expect(migrateLegacyCycleProjectConstraint()).resolves.toBeUndefined();
    const result = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cycles' AND column_name = 'project_id'");
    expect(result.rowCount).toBe(0);
  });

  it('preserves legacy cycles and permits team-only inserts after repeated migration', async () => {
    const { project } = await seedWorkspaceFixture();
    const projectRows = await pool.query('SELECT team_id FROM projects WHERE id = $1', [project.id]);
    const teamId = projectRows.rows[0].team_id as string;
    await pool.query('ALTER TABLE cycles ADD COLUMN IF NOT EXISTS project_id TEXT;');
    await pool.query('ALTER TABLE cycles ALTER COLUMN project_id SET NOT NULL;');
    await pool.query(`
      INSERT INTO cycles (id, project_id, team_id, name, start_date, end_date, completed)
      VALUES ($1, $2, $3, $4, $5, $6, true)
    `, ['legacy-cycle', project.id, teamId, 'Legacy cycle', '2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z']);
    const before = await pool.query('SELECT * FROM cycles WHERE id = $1', ['legacy-cycle']);
    const teamOnlyCycle = {
      id: 'team-only-cycle', teamId, name: 'Current cycle',
      startDate: new Date('2026-02-01T00:00:00Z'), endDate: new Date('2026-02-15T00:00:00Z'),
    };
    await expect(db.insert(cycles).values(teamOnlyCycle)).rejects.toThrow();

    await migrateLegacyCycleProjectConstraint();
    await db.insert(cycles).values(teamOnlyCycle);
    await migrateLegacyCycleProjectConstraint();

    const after = await pool.query('SELECT * FROM cycles WHERE id = $1', ['legacy-cycle']);
    expect(after.rows).toEqual(before.rows);
    const inserted = await pool.query('SELECT project_id, team_id, name FROM cycles WHERE id = $1', ['team-only-cycle']);
    expect(inserted.rows).toEqual([{ project_id: null, team_id: teamId, name: 'Current cycle' }]);
  });
});
