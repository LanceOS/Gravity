-- Migration: create mcp_connection_tokens table
-- Generated: 2026-05-27

BEGIN;

CREATE TABLE IF NOT EXISTS mcp_connection_tokens (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  token_hash text NOT NULL,
  hmac_key_id text NOT NULL DEFAULT 'env',
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  single_use boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  generated_by text NOT NULL,
  source_ip text,
  connection_type text NOT NULL DEFAULT 'http-post',
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS mcp_connection_tokens_workspace_id_idx ON mcp_connection_tokens (workspace_id);
CREATE INDEX IF NOT EXISTS mcp_connection_tokens_token_hash_idx ON mcp_connection_tokens (token_hash);

COMMIT;
