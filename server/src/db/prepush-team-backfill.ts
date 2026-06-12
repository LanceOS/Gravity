import dotenv from 'dotenv';
import pg from 'pg';
import { mergeDuplicateTeamLabels } from './label-migration.js';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the team backfill before db:push.');
}

if (databaseUrl.startsWith('pgmem://')) {
  console.log('Skipping team backfill for pg-mem database.');
  process.exit(0);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: databaseUrl });

async function tableExists(tableName: string) {
  const result = await pool.query<{ exists: boolean }>('select to_regclass($1) is not null as exists', [
    `public.${tableName}`,
  ]);
  return result.rows[0]?.exists ?? false;
}

async function columnExists(tableName: string, columnName: string) {
  try {
    const result = await pool.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        LIMIT 1
      `,
      [tableName, columnName],
    );

    return (result.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

async function main() {
  const hasWorkspaces = await tableExists('workspaces');
  if (!hasWorkspaces) {
    console.log('Skipping team backfill because workspaces table does not exist yet.');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#6B7280',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS teams_workspace_id_idx ON teams (workspace_id);

    INSERT INTO teams (id, workspace_id, name, description, color, created_at, updated_at)
    SELECT 'team-general-' || id, id, 'General', 'Default team for workspace', '#6B7280', NOW(), NOW()
    FROM workspaces
    ON CONFLICT (id) DO NOTHING;
  `);

  const hasProjects = await tableExists('projects');
  if (hasProjects) {
    await pool.query(`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_url TEXT;
      CREATE INDEX IF NOT EXISTS projects_team_id_idx ON projects (team_id);

      UPDATE projects
      SET team_id = 'team-general-' || workspace_id
      WHERE team_id IS NULL
        OR team_id = ''
        OR team_id NOT IN (SELECT id FROM teams);
    `);
  }

  const hasCycles = await tableExists('cycles');
  const hasLabels = await tableExists('labels');
  const hasDomains = await tableExists('domains');
  const hasTickets = await tableExists('tickets');
  const cyclesHaveProjectId = hasCycles && await columnExists('cycles', 'project_id');
  const labelsHaveProjectId = hasLabels && await columnExists('labels', 'project_id');
  const ticketsHaveDomainId = hasTickets && await columnExists('tickets', 'domain_id');

  if (hasCycles && hasProjects && cyclesHaveProjectId) {
    await pool.query(`
      ALTER TABLE cycles ADD COLUMN IF NOT EXISTS team_id TEXT;
      CREATE INDEX IF NOT EXISTS cycles_team_id_idx ON cycles (team_id);

      UPDATE cycles
      SET team_id = projects.team_id
      FROM projects
      WHERE cycles.project_id = projects.id
        AND (
          cycles.team_id IS NULL
          OR cycles.team_id = ''
          OR cycles.team_id NOT IN (SELECT id FROM teams)
        );
    `);
  }

  if (hasLabels && hasProjects && labelsHaveProjectId) {
    await pool.query(`
      ALTER TABLE labels ADD COLUMN IF NOT EXISTS team_id TEXT;
      CREATE INDEX IF NOT EXISTS labels_team_id_idx ON labels (team_id);

      UPDATE labels
      SET team_id = projects.team_id
      FROM projects
      WHERE labels.project_id = projects.id
        AND (
          labels.team_id IS NULL
          OR labels.team_id = ''
          OR labels.team_id NOT IN (SELECT id FROM teams)
        );
    `);
  }

  if (hasDomains && hasLabels && hasProjects) {
    if (labelsHaveProjectId) {
      await pool.query(`
        ALTER TABLE labels ALTER COLUMN project_id DROP NOT NULL;
      `);
    }

    if (labelsHaveProjectId) {
      await pool.query(`
        INSERT INTO labels (id, project_id, team_id, name, color, description, sort_order, created_at)
        SELECT domains.id, domains.project_id, COALESCE(domains.team_id, projects.team_id), domains.name, domains.color, '', 0, domains.created_at
        FROM domains
        LEFT JOIN projects ON domains.project_id = projects.id
        WHERE COALESCE(domains.team_id, projects.team_id) IS NOT NULL
        ON CONFLICT (id) DO NOTHING;
      `);
    } else {
      await pool.query(`
        INSERT INTO labels (id, team_id, name, color, description, sort_order, created_at)
        SELECT domains.id, COALESCE(domains.team_id, projects.team_id), domains.name, domains.color, '', 0, domains.created_at
        FROM domains
        LEFT JOIN projects ON domains.project_id = projects.id
        WHERE COALESCE(domains.team_id, projects.team_id) IS NOT NULL
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    if (ticketsHaveDomainId) {
      await pool.query(`
        INSERT INTO ticket_labels (ticket_id, label_id)
        SELECT tickets.id, domains.id
        FROM tickets
        INNER JOIN domains ON domains.id = tickets.domain_id
        LEFT JOIN projects ON domains.project_id = projects.id
        WHERE tickets.domain_id IS NOT NULL
          AND tickets.domain_id <> ''
          AND COALESCE(domains.team_id, projects.team_id) IS NOT NULL
        ON CONFLICT (ticket_id, label_id) DO NOTHING;
      `);
    }
  }

  if (hasLabels) {
    await mergeDuplicateTeamLabels(pool);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS labels_team_name_unique_idx ON labels (team_id, name);
    `);
  }

  console.log('Team hierarchy backfill completed.');
}

try {
  await main();
} finally {
  await pool.end();
}
