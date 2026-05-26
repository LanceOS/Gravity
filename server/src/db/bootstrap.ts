import { getMigrations } from 'better-auth/db/migration';
import { auth } from '../auth.js';
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, provider)
    );
  `);

  await pool.query(`
    ALTER TABLE user_external_credentials ADD COLUMN IF NOT EXISTS provider TEXT;
    UPDATE user_external_credentials uec
    SET provider = COALESCE(uec.provider, us.ai_provider, 'openai')
    FROM user_settings us
    WHERE uec.user_id = us.user_id;
    UPDATE user_external_credentials
    SET provider = 'openai'
    WHERE provider IS NULL;
    ALTER TABLE user_external_credentials ALTER COLUMN provider SET NOT NULL;
    ALTER TABLE user_external_credentials DROP CONSTRAINT IF EXISTS user_external_credentials_pkey;
    ALTER TABLE user_external_credentials ADD PRIMARY KEY (user_id, provider);
    CREATE INDEX IF NOT EXISTS user_external_credentials_user_id_idx ON user_external_credentials (user_id);
  `);

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
  `);

  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}