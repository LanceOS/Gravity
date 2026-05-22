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

    CREATE TABLE IF NOT EXISTS validations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      issued_by_user_id TEXT,
      email TEXT NOT NULL,
      invite_url TEXT NOT NULL,
      validation_code TEXT NOT NULL,
      workspace_private_key TEXT NOT NULL,
      guest_user_id TEXT,
      guest_username TEXT,
      guest_password_hash TEXT,
      is_used BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

    CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id TEXT PRIMARY KEY,
      host_url TEXT NOT NULL DEFAULT '',
      join_mode TEXT NOT NULL DEFAULT 'approval_required',
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

    CREATE TABLE IF NOT EXISTS workspace_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL,
      host_url TEXT NOT NULL,
      remote_workspace_id TEXT,
      remote_workspace_key_hint TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'saved',
      last_connected_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS identities (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      public_key TEXT NOT NULL UNIQUE,
      encrypted_private_key TEXT,
      is_local_owner BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS peer_connections (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      host_url TEXT NOT NULL,
      host_display_name TEXT NOT NULL DEFAULT '',
      host_public_key TEXT NOT NULL,
      last_synced_event_id INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ,
      last_attempt_at TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      last_error TEXT,
      last_applied_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE peer_connections ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE peer_connections ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
    ALTER TABLE peer_connections ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
    ALTER TABLE peer_connections ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
    ALTER TABLE peer_connections ADD COLUMN IF NOT EXISTS last_error TEXT;
    ALTER TABLE peer_connections ADD COLUMN IF NOT EXISTS last_applied_count INTEGER NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS federation_invites (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      issued_by_user_id TEXT NOT NULL,
      invite_token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      accepted_by_public_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspace_peers (
      workspace_id TEXT NOT NULL,
      identity_id TEXT NOT NULL,
      invited_by_user_id TEXT NOT NULL,
      peer_host_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'verified',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, identity_id)
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      event_id SERIAL PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_public_key TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload JSONB NOT NULL,
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
  `);

  await pool.query(`
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_view TEXT NOT NULL DEFAULT 'board';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ollama_endpoint TEXT NOT NULL DEFAULT '${env.ollamaDefaultEndpoint}';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS preferred_ollama_model TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'openai';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS agent_integration TEXT NOT NULL DEFAULT 'ollama';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS project_layout TEXT NOT NULL DEFAULT 'standard';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS encrypted_api_key TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE validations ADD COLUMN IF NOT EXISTS workspace_id TEXT;
    ALTER TABLE validations ADD COLUMN IF NOT EXISTS issued_by_user_id TEXT;
    ALTER TABLE validations ADD COLUMN IF NOT EXISTS guest_user_id TEXT;
    ALTER TABLE validations ADD COLUMN IF NOT EXISTS guest_username TEXT;
    ALTER TABLE validations ADD COLUMN IF NOT EXISTS guest_password_hash TEXT;
    ALTER TABLE validations ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
    ALTER TABLE validations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
    ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS provisioned_by_validation_id TEXT;
    ALTER TABLE project_members ADD COLUMN IF NOT EXISTS provisioned_by_validation_id TEXT;
    ALTER TABLE identities ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;
    ALTER TABLE identities ADD COLUMN IF NOT EXISTS is_local_owner BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE peer_connections ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT '';
    UPDATE peer_connections SET workspace_id = '' WHERE workspace_id IS NULL;
    ALTER TABLE peer_connections ALTER COLUMN workspace_id SET NOT NULL;
    ALTER TABLE peer_connections ADD COLUMN IF NOT EXISTS host_display_name TEXT NOT NULL DEFAULT '';

    CREATE INDEX IF NOT EXISTS validations_email_code_url_idx ON validations (email, validation_code, invite_url);
    CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON workspace_members (user_id);
    CREATE INDEX IF NOT EXISTS peer_connections_workspace_id_idx ON peer_connections (workspace_id);
    CREATE INDEX IF NOT EXISTS workspace_peers_identity_id_idx ON workspace_peers (identity_id);
    CREATE INDEX IF NOT EXISTS sync_outbox_workspace_id_idx ON sync_outbox (workspace_id);
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