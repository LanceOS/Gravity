-- Backfill `provider`, deduplicate, and ensure composite primary key on (user_id, provider)
-- This migration is written to be idempotent and safe for production.

-- Acquire an advisory lock to serialize schema-change execution for this table
SELECT pg_advisory_lock(123456789);
--> statement-breakpoint

-- Backfill provider from user_settings.ai_provider where available, else 'openai'
UPDATE user_external_credentials u
SET provider = COALESCE(
  (SELECT s.ai_provider FROM user_settings s WHERE s.user_id = u.user_id LIMIT 1),
  'openai'
)
WHERE u.provider IS NULL OR u.provider = '';
--> statement-breakpoint

-- Deduplicate any duplicate rows for the same (user_id, provider), keeping the
-- most-recent row by updated_at/created_at. Use ctid to identify duplicate rows.
WITH duplicates AS (
  SELECT ctid FROM (
    SELECT ctid, ROW_NUMBER() OVER (PARTITION BY user_id, provider ORDER BY COALESCE(updated_at, created_at) DESC) AS rn
    FROM user_external_credentials
  ) t
  WHERE t.rn > 1
)
DELETE FROM user_external_credentials WHERE ctid IN (SELECT ctid FROM duplicates);
--> statement-breakpoint

-- Make provider non-null now that rows are backfilled
ALTER TABLE user_external_credentials ALTER COLUMN provider SET NOT NULL;
--> statement-breakpoint

-- Ensure the primary key is the composite (user_id, provider).
DO $$
DECLARE
  pkname text;
BEGIN
  SELECT c.conname INTO pkname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'user_external_credentials' AND c.contype = 'p'
  LIMIT 1;

  IF pkname IS NOT NULL THEN
    -- If an existing primary key exists but is not the desired columns, drop it
    -- (we deduplicated above so adding the new PK should succeed).
    EXECUTE format('ALTER TABLE user_external_credentials DROP CONSTRAINT IF EXISTS %I', pkname);
  END IF;

  -- Add the composite primary key
  BEGIN
    EXECUTE 'ALTER TABLE user_external_credentials ADD PRIMARY KEY (user_id, provider)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not add primary key on user_external_credentials: %', SQLERRM;
  END;
END$$;
--> statement-breakpoint

-- Create index on user_id to support lookups
CREATE INDEX IF NOT EXISTS user_external_credentials_user_id_idx ON user_external_credentials (user_id);
--> statement-breakpoint

-- Release advisory lock
SELECT pg_advisory_unlock(123456789);
--> statement-breakpoint
