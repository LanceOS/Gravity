import { getMigrations } from 'better-auth/db/migration';
import { auth } from '../modules/auth/auth.js';
import { env } from '../env.js';
import { pool } from './index.js';
import { mergeDuplicateTeamLabels } from './label-migration.js';

async function hasConstraint(constraintName: string) {
  try {
    const result = await pool.query(
      `
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = $1
        LIMIT 1
      `,
      [constraintName],
    );

    return (result.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

async function hasTable(tableName: string) {
  try {
    const result = await pool.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
        LIMIT 1
      `,
      [tableName],
    );

    return (result.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

async function hasColumn(tableName: string, columnName: string) {
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

async function ensureConstraint(tableName: string, constraintName: string, definition: string) {
  if (await hasConstraint(constraintName)) {
    return;
  }

  await pool.query(`ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" ${definition}`);
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'guest_contributor',
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      tutorial_completed BOOLEAN NOT NULL DEFAULT FALSE,
      theme TEXT NOT NULL DEFAULT 'dark',
      default_view TEXT NOT NULL DEFAULT 'board',
      ollama_endpoint TEXT NOT NULL DEFAULT '${env.ollamaDefaultEndpoint}',
      preferred_ollama_model TEXT,
      ai_provider TEXT NOT NULL DEFAULT 'openai',
      agent_integration TEXT NOT NULL DEFAULT 'ollama',
      project_layout TEXT NOT NULL DEFAULT 'standard',
      encrypted_api_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );



    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#6B7280',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL UNIQUE,
      workspace_key TEXT NOT NULL,
      default_project_id TEXT,
      host_url TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      provisioned_by_validation_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_member_activity (
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id TEXT PRIMARY KEY,
      host_url TEXT NOT NULL DEFAULT '',
      join_mode TEXT NOT NULL DEFAULT 'approval_required',
      hierarchy_mode TEXT NOT NULL DEFAULT 'flat',
      disabled_mcp_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspace_invites (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      max_uses INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspace_join_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      invite_id TEXT,
      requesting_user_id TEXT,
      requester_name TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      requester_avatar TEXT,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mcp_connection_tokens (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      hmac_key_id TEXT NOT NULL,
      scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
      expires_at TIMESTAMPTZ,
      single_use BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'active',
      generated_by TEXT NOT NULL,
      source_ip TEXT,
      connection_type TEXT NOT NULL DEFAULT 'http-post',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );





    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      team_id TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'planned',
      invite_code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      github_repo_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'developer',
      provisioned_by_validation_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, user_id)
    );



    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      project_id TEXT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6B7280',
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ticket_labels (
      ticket_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      PRIMARY KEY (ticket_id, label_id)
    );


    CREATE TABLE IF NOT EXISTS cycles (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      start_date TIMESTAMPTZ NOT NULL,
      end_date TIMESTAMPTZ NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'no_priority',
      assignee_id TEXT,
      project_id TEXT NOT NULL,
      cycle_id TEXT,
      parent_id TEXT,
      blocked_ticket_id TEXT,
      pr_status TEXT NOT NULL DEFAULT 'none',
      pr_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ticket_dependencies (
      ticket_id TEXT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
      blocked_ticket_id TEXT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, blocked_ticket_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_external_credentials (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      encrypted_api_key BYTEA NOT NULL,
      encrypted_dek BYTEA NOT NULL,
      aes_iv BYTEA NOT NULL,
      aes_auth_tag BYTEA NOT NULL,
      kms_kek_id VARCHAR(255) NOT NULL,
      preferred_model TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS note_metadata (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      bucket_path TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE user_external_credentials ADD COLUMN IF NOT EXISTS provider TEXT;
    ALTER TABLE user_external_credentials ADD COLUMN IF NOT EXISTS preferred_model TEXT;
  `);

  // Backfill `provider` in a set-based update (avoids N+1 queries)
  if (!env.databaseUrl.startsWith('pgmem://')) {
    await pool.query(`
      UPDATE user_external_credentials
      SET provider = COALESCE(
        (SELECT s.ai_provider FROM user_settings s WHERE s.user_id = user_external_credentials.user_id LIMIT 1),
        'openai'
      )
      WHERE provider IS NULL OR provider = '';
    `);
  }

  // NOTE: structural changes (primary key/index) are handled in a dedicated
  // migration under `server/drizzle/`. That migration performs safe,
  // set-based backfills, de-duplication, and constraint changes with
  // appropriate locking. This keeps startup fast and avoids long DDL locks.

  await pool.query(`
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_view TEXT NOT NULL DEFAULT 'board';
  `);

  await pool.query(
    `
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ollama_endpoint TEXT NOT NULL DEFAULT '${env.ollamaDefaultEndpoint.replace(/'/g, "''")}';
  `
  );

  await pool.query(`
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS preferred_ollama_model TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'openai';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS agent_integration TEXT NOT NULL DEFAULT 'ollama';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS project_layout TEXT NOT NULL DEFAULT 'standard';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS encrypted_api_key TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


    ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS disabled_mcp_tools JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS hierarchy_mode TEXT NOT NULL DEFAULT 'flat';


    CREATE INDEX IF NOT EXISTS projects_workspace_id_idx ON projects (workspace_id);
    CREATE INDEX IF NOT EXISTS project_members_user_id_idx ON project_members (user_id);
    CREATE INDEX IF NOT EXISTS tickets_project_id_idx ON tickets (project_id);
    CREATE INDEX IF NOT EXISTS tickets_assignee_id_idx ON tickets (assignee_id);
    CREATE INDEX IF NOT EXISTS tickets_cycle_id_idx ON tickets (cycle_id);
    CREATE INDEX IF NOT EXISTS tickets_parent_id_idx ON tickets (parent_id);
    CREATE INDEX IF NOT EXISTS tickets_blocked_ticket_id_idx ON tickets (blocked_ticket_id);
    CREATE INDEX IF NOT EXISTS ticket_dependencies_ticket_id_idx ON ticket_dependencies (ticket_id);
    CREATE INDEX IF NOT EXISTS ticket_dependencies_blocked_ticket_id_idx ON ticket_dependencies (blocked_ticket_id);
    CREATE INDEX IF NOT EXISTS comments_ticket_id_idx ON comments (ticket_id);
    CREATE INDEX IF NOT EXISTS comments_user_id_idx ON comments (user_id);
    CREATE INDEX IF NOT EXISTS note_metadata_project_id_user_id_idx ON note_metadata (project_id, user_id);
    CREATE INDEX IF NOT EXISTS ticket_labels_label_id_idx ON ticket_labels (label_id);
  `);

  await pool.query(`
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS branch_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS blocked_ticket_id TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_url TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id TEXT;
    ALTER TABLE cycles ADD COLUMN IF NOT EXISTS team_id TEXT;
    ALTER TABLE labels ADD COLUMN IF NOT EXISTS team_id TEXT;
    ALTER TABLE labels ADD COLUMN IF NOT EXISTS project_id TEXT;
    ALTER TABLE labels ALTER COLUMN project_id DROP NOT NULL;

    CREATE INDEX IF NOT EXISTS teams_workspace_id_idx ON teams (workspace_id);
    CREATE INDEX IF NOT EXISTS projects_team_id_idx ON projects (team_id);
    CREATE INDEX IF NOT EXISTS cycles_team_id_idx ON cycles (team_id);
    CREATE INDEX IF NOT EXISTS labels_team_id_idx ON labels (team_id);
    CREATE INDEX IF NOT EXISTS labels_project_id_idx ON labels (project_id);

    DROP INDEX IF EXISTS labels_team_name_unique_idx;
    DROP INDEX IF EXISTS labels_project_name_unique_idx;
    CREATE UNIQUE INDEX IF NOT EXISTS labels_team_name_unique_idx ON labels (team_id, name) WHERE project_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS labels_project_name_unique_idx ON labels (project_id, name) WHERE project_id IS NOT NULL;
  `);

  await pool.query(`
    INSERT INTO ticket_dependencies (ticket_id, blocked_ticket_id)
    SELECT blocked_ticket_id, id
    FROM tickets
    WHERE blocked_ticket_id IS NOT NULL
    ON CONFLICT (ticket_id, blocked_ticket_id) DO NOTHING;
  `).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to backfill ticket dependency relations:', err);
  });

  // Migrate/Bootstrap default teams and preserve legacy domains as team labels.
  const hasProjectsTable = await hasTable('projects');
  const hasCyclesTable = await hasTable('cycles');
  const hasLabelsTable = await hasTable('labels');
  const hasDomainsTable = await hasTable('domains');
  const hasTicketsTable = await hasTable('tickets');

  const cyclesHaveProjectId = hasCyclesTable && await hasColumn('cycles', 'project_id');
  const labelsHaveProjectId = hasLabelsTable && await hasColumn('labels', 'project_id');
  const ticketsHaveDomainId = hasTicketsTable && await hasColumn('tickets', 'domain_id');

  await pool.query(`
    INSERT INTO teams (id, workspace_id, name, description, color, created_at, updated_at)
    SELECT 'team-general-' || id, id, 'General', 'Default team for workspace', '#6B7280', NOW(), NOW()
    FROM workspaces
    ON CONFLICT (id) DO NOTHING;
  `).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to bootstrap default teams:', err);
  });

  if (hasProjectsTable) {
    await pool.query(`
      UPDATE projects
      SET team_id = 'team-general-' || workspace_id
      WHERE team_id IS NULL
        OR team_id = ''
        OR team_id NOT IN (SELECT id FROM teams);
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to backfill project team assignments:', err);
    });
  }

  if (hasCyclesTable && hasProjectsTable && cyclesHaveProjectId) {
    await pool.query(`
      UPDATE cycles
      SET team_id = projects.team_id
      FROM projects
      WHERE cycles.project_id = projects.id
        AND (
          cycles.team_id IS NULL
          OR cycles.team_id = ''
          OR cycles.team_id NOT IN (SELECT id FROM teams)
        );
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to backfill cycle team assignments:', err);
    });
  }

  if (hasLabelsTable && hasProjectsTable && labelsHaveProjectId) {
    await pool.query(`
      UPDATE labels
      SET team_id = projects.team_id
      FROM projects
      WHERE labels.project_id = projects.id
        AND (labels.team_id IS NULL OR labels.team_id = '');
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to run labels team backfill:', err);
    });
  }

  if (hasLabelsTable && hasProjectsTable && labelsHaveProjectId) {
    await pool.query(`
      INSERT INTO labels (id, project_id, team_id, name, color, description, sort_order, created_at)
      SELECT
        labels.id || ':' || projects.id,
        projects.id,
        projects.team_id,
        labels.name,
        labels.color,
        labels.description,
        labels.sort_order,
        labels.created_at
      FROM labels
      INNER JOIN projects ON projects.team_id = labels.team_id
      INNER JOIN workspace_settings ON workspace_settings.workspace_id = projects.workspace_id
      WHERE labels.project_id IS NULL
        AND workspace_settings.hierarchy_mode = 'flat'
      ON CONFLICT (id) DO NOTHING;
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to clone project-based workspace labels into projects:', err);
    });

    await pool.query(`
      INSERT INTO ticket_labels (ticket_id, label_id)
      SELECT ticket_labels.ticket_id, ticket_labels.label_id || ':' || tickets.project_id
      FROM ticket_labels
      INNER JOIN tickets ON tickets.id = ticket_labels.ticket_id
      INNER JOIN projects ON projects.id = tickets.project_id
      INNER JOIN workspace_settings ON workspace_settings.workspace_id = projects.workspace_id
      INNER JOIN labels ON labels.id = ticket_labels.label_id
      WHERE labels.project_id IS NULL
        AND workspace_settings.hierarchy_mode = 'flat'
      ON CONFLICT (ticket_id, label_id) DO NOTHING;
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to clone ticket label links for project-based workspaces:', err);
    });

    await pool.query(`
      DELETE FROM ticket_labels
      WHERE ticket_id IN (
        SELECT t.id
        FROM tickets t
        INNER JOIN projects p ON t.project_id = p.id
        INNER JOIN workspace_settings ws ON ws.workspace_id = p.workspace_id
        WHERE ws.hierarchy_mode = 'flat'
      ) AND label_id IN (
        SELECT l.id
        FROM labels l
        WHERE l.project_id IS NULL
      );
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to clear shared project-based workspace ticket labels:', err);
    });

    await pool.query(`
      DELETE FROM labels
      WHERE project_id IS NULL
        AND team_id IN (
          SELECT p.team_id
          FROM projects p
          INNER JOIN workspace_settings ws ON ws.workspace_id = p.workspace_id
          WHERE ws.hierarchy_mode = 'flat'
        );
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to remove shared project-based workspace labels:', err);
    });
  }

  if (hasDomainsTable && hasLabelsTable && hasProjectsTable) {
    if (labelsHaveProjectId) {
      await pool.query(`
        ALTER TABLE labels ALTER COLUMN project_id DROP NOT NULL;
      `).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to relax legacy label project_id constraint:', err);
      });
    }

    if (labelsHaveProjectId) {
      await pool.query(`
        INSERT INTO labels (id, project_id, team_id, name, color, description, sort_order, created_at)
        SELECT domains.id, domains.project_id, COALESCE(domains.team_id, projects.team_id), domains.name, domains.color, '', 0, domains.created_at
        FROM domains
        LEFT JOIN projects ON domains.project_id = projects.id
        WHERE COALESCE(domains.team_id, projects.team_id) IS NOT NULL
        ON CONFLICT (id) DO NOTHING;
      `).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to migrate domains into labels:', err);
      });
    } else {
      await pool.query(`
        INSERT INTO labels (id, team_id, name, color, description, sort_order, created_at)
        SELECT domains.id, COALESCE(domains.team_id, projects.team_id), domains.name, domains.color, '', 0, domains.created_at
        FROM domains
        LEFT JOIN projects ON domains.project_id = projects.id
        WHERE COALESCE(domains.team_id, projects.team_id) IS NOT NULL
        ON CONFLICT (id) DO NOTHING;
      `).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to migrate domains into labels:', err);
      });
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
      `).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to migrate ticket domain assignments into ticket labels:', err);
      });
    }
  }

  if (hasLabelsTable && hasProjectsTable && labelsHaveProjectId) {
    await pool.query(`
      INSERT INTO labels (id, project_id, team_id, name, color, description, sort_order, created_at)
      SELECT
        labels.id || ':' || projects.id,
        projects.id,
        projects.team_id,
        labels.name,
        labels.color,
        labels.description,
        labels.sort_order,
        labels.created_at
      FROM labels
      INNER JOIN projects ON projects.team_id = labels.team_id
      INNER JOIN workspace_settings ON workspace_settings.workspace_id = projects.workspace_id
      WHERE labels.project_id IS NULL
        AND workspace_settings.hierarchy_mode = 'flat'
      ON CONFLICT (id) DO NOTHING;
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to clone project-based workspace labels into projects:', err);
    });

    await pool.query(`
      INSERT INTO ticket_labels (ticket_id, label_id)
      SELECT ticket_labels.ticket_id, ticket_labels.label_id || ':' || tickets.project_id
      FROM ticket_labels
      INNER JOIN tickets ON tickets.id = ticket_labels.ticket_id
      INNER JOIN projects ON projects.id = tickets.project_id
      INNER JOIN workspace_settings ON workspace_settings.workspace_id = projects.workspace_id
      INNER JOIN labels ON labels.id = ticket_labels.label_id
      WHERE labels.project_id IS NULL
        AND workspace_settings.hierarchy_mode = 'flat'
      ON CONFLICT (ticket_id, label_id) DO NOTHING;
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to clone ticket label links for project-based workspaces:', err);
    });

    await pool.query(`
      DELETE FROM ticket_labels
      WHERE ticket_id IN (
        SELECT t.id
        FROM tickets t
        INNER JOIN projects p ON t.project_id = p.id
        INNER JOIN workspace_settings ws ON ws.workspace_id = p.workspace_id
        WHERE ws.hierarchy_mode = 'flat'
      ) AND label_id IN (
        SELECT l.id
        FROM labels l
        WHERE l.project_id IS NULL
      );
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to clear shared project-based workspace ticket labels:', err);
    });

    await pool.query(`
      DELETE FROM labels
      WHERE project_id IS NULL
        AND team_id IN (
          SELECT p.team_id
          FROM projects p
          INNER JOIN workspace_settings ws ON ws.workspace_id = p.workspace_id
          WHERE ws.hierarchy_mode = 'flat'
        );
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to remove shared project-based workspace labels:', err);
    });
  }

  if (hasLabelsTable) {
    await mergeDuplicateTeamLabels(pool).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to merge duplicate labels during team migration:', err);
    });

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS labels_team_name_unique_idx ON labels (team_id, name) WHERE project_id IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS labels_project_name_unique_idx ON labels (project_id, name) WHERE project_id IS NOT NULL;
    `).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to ensure unique team label names:', err);
    });
  }

  // Clean up any orphaned records that didn't receive a team_id
  await pool.query(`
    DELETE FROM labels WHERE team_id IS NULL OR team_id = '';
    DELETE FROM cycles WHERE team_id IS NULL OR team_id = '';
  `).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to clean up orphaned records without team_id:', err);
  });

  await pool.query(`
    ALTER TABLE projects ALTER COLUMN team_id SET NOT NULL;
    ALTER TABLE cycles ALTER COLUMN team_id SET NOT NULL;
    ALTER TABLE labels ALTER COLUMN team_id SET NOT NULL;
  `).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to enforce team ownership on workspace records:', err);
  });

  await ensureConstraint(
    'teams',
    'teams_workspace_id_workspaces_id_fk',
    'FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE',
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure teams workspace foreign key:', err);
  });

  await ensureConstraint(
    'projects',
    'projects_team_id_teams_id_fk',
    'FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE NO ACTION',
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure projects team foreign key:', err);
  });

  await ensureConstraint(
    'cycles',
    'cycles_team_id_teams_id_fk',
    'FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE NO ACTION',
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure cycles team foreign key:', err);
  });

  await ensureConstraint(
    'labels',
    'labels_project_id_projects_id_fk',
    'FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE',
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure labels project foreign key:', err);
  });

  await ensureConstraint(
    'labels',
    'labels_team_id_teams_id_fk',
    'FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE',
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure labels team foreign key:', err);
  });


  // Ensure note_metadata has excerpt and full-text search vector columns/indexes
  await pool.query(`
    ALTER TABLE note_metadata ADD COLUMN IF NOT EXISTS excerpt TEXT NOT NULL DEFAULT '';
  `);
  // Add search_vector column and indexes only when running against real Postgres.
  if (!env.databaseUrl.startsWith('pgmem://')) {
    await pool.query(`
      ALTER TABLE note_metadata ADD COLUMN IF NOT EXISTS search_vector tsvector;
    `);

    // Backfill search_vector safely
    await pool.query(`
      UPDATE note_metadata
      SET search_vector = to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(excerpt, ''))
      WHERE search_vector IS NULL;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS note_metadata_search_idx ON note_metadata USING gin (search_vector);
    `);
  }
  else {
    // For pg-mem tests, create a fallback text column so Drizzle's INSERT
    // statements (which may reference the column) succeed even though
    // full-text features are unavailable in pg-mem.
    await pool.query(`
      ALTER TABLE note_metadata ADD COLUMN IF NOT EXISTS search_vector TEXT;
    `);
  }

  // Ensure updated_at ordering index exists for note metadata (safe for pg-mem)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS note_metadata_project_id_user_id_updated_at_idx ON note_metadata (project_id, user_id, updated_at);
  `);

  // Ensure `usage_count` exists for mcp_connection_tokens (backfill-safe)
  await pool.query(`
    ALTER TABLE mcp_connection_tokens ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS mcp_connection_tokens_workspace_id_idx ON mcp_connection_tokens (workspace_id);
    CREATE INDEX IF NOT EXISTS mcp_connection_tokens_token_hash_idx ON mcp_connection_tokens (token_hash);
  `);

  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}
