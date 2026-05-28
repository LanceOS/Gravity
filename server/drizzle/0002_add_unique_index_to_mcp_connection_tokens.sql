-- Deduplicate any existing rows that share the same (workspace_id, token_hash)
WITH duplicates AS (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id, token_hash ORDER BY created_at DESC, id DESC) AS rn
    FROM mcp_connection_tokens
  ) t
  WHERE t.rn > 1
)
DELETE FROM mcp_connection_tokens WHERE id IN (SELECT id FROM duplicates);
--> statement-breakpoint

-- Add a unique index on (workspace_id, token_hash) to avoid duplicate token rows
CREATE UNIQUE INDEX IF NOT EXISTS mcp_connection_tokens_workspace_id_token_hash_idx
  ON mcp_connection_tokens (workspace_id, token_hash);
--> statement-breakpoint
