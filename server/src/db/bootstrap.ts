import { getMigrations } from 'better-auth/db/migration';
import { auth } from '../modules/auth/auth.js';
import { env } from '../env.js';
import { pool } from './index.js';

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
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'planned',
      invite_code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6B7280',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
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
      project_id TEXT NOT NULL,
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
      domain_id TEXT,
      cycle_id TEXT,
      parent_id TEXT,
      pr_status TEXT NOT NULL DEFAULT 'none',
      pr_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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


    CREATE INDEX IF NOT EXISTS projects_workspace_id_idx ON projects (workspace_id);
    CREATE INDEX IF NOT EXISTS project_members_user_id_idx ON project_members (user_id);
    CREATE INDEX IF NOT EXISTS domains_project_id_idx ON domains (project_id);
    CREATE INDEX IF NOT EXISTS cycles_project_id_idx ON cycles (project_id);
    CREATE INDEX IF NOT EXISTS tickets_project_id_idx ON tickets (project_id);
    CREATE INDEX IF NOT EXISTS tickets_assignee_id_idx ON tickets (assignee_id);
    CREATE INDEX IF NOT EXISTS tickets_domain_id_idx ON tickets (domain_id);
    CREATE INDEX IF NOT EXISTS tickets_cycle_id_idx ON tickets (cycle_id);
    CREATE INDEX IF NOT EXISTS tickets_parent_id_idx ON tickets (parent_id);
    CREATE INDEX IF NOT EXISTS comments_ticket_id_idx ON comments (ticket_id);
    CREATE INDEX IF NOT EXISTS comments_user_id_idx ON comments (user_id);
    CREATE INDEX IF NOT EXISTS note_metadata_project_id_user_id_idx ON note_metadata (project_id, user_id);
    CREATE INDEX IF NOT EXISTS labels_project_id_idx ON labels (project_id);
    CREATE INDEX IF NOT EXISTS ticket_labels_label_id_idx ON ticket_labels (label_id);
  `);

  await pool.query(`
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS branch_name TEXT NOT NULL DEFAULT '';
  `);

  // Migrate existing domain data to labels and ticket_labels
  await pool.query(`
    INSERT INTO labels (id, project_id, name, color, description, sort_order, created_at)
    SELECT id, project_id, name, color, '', 0, created_at
    FROM domains
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO ticket_labels (ticket_id, label_id)
    SELECT id AS ticket_id, domain_id AS label_id
    FROM tickets
    WHERE domain_id IS NOT NULL AND domain_id != ''
    ON CONFLICT (ticket_id, label_id) DO NOTHING;
  `).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to run labels backfill migration:', err);
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