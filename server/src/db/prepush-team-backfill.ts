import dotenv from 'dotenv';
import pg from 'pg';

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
  if (hasCycles && hasProjects) {
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

  const hasDomains = await tableExists('domains');
  if (hasDomains && hasProjects) {
    await pool.query(`
      ALTER TABLE domains ADD COLUMN IF NOT EXISTS team_id TEXT;
      CREATE INDEX IF NOT EXISTS domains_team_id_idx ON domains (team_id);

      UPDATE domains
      SET team_id = projects.team_id
      FROM projects
      WHERE domains.project_id = projects.id
        AND (
          domains.team_id IS NULL
          OR domains.team_id = ''
          OR domains.team_id NOT IN (SELECT id FROM teams)
        );
    `);
  }

  console.log('Team hierarchy backfill completed.');
}

try {
  await main();
} finally {
  await pool.end();
}
