-- Add excerpt and full-text search vector to note_metadata
ALTER TABLE "note_metadata"
  ADD COLUMN IF NOT EXISTS "excerpt" text NOT NULL DEFAULT '';

-- Add tsvector column for full-text search
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='note_metadata' AND column_name='search_vector'
  ) THEN
    ALTER TABLE "note_metadata" ADD COLUMN "search_vector" tsvector;
  END IF;
END$$;

-- Backfill search_vector from title + excerpt
UPDATE "note_metadata"
SET search_vector = to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(excerpt, ''))
WHERE search_vector IS NULL;

-- Create GIN index for fast FTS
CREATE INDEX IF NOT EXISTS note_metadata_search_idx ON note_metadata USING gin (search_vector);

-- Ensure index on (project_id, user_id, updated_at) for fast sidebar queries
CREATE INDEX IF NOT EXISTS note_metadata_project_id_user_id_updated_at_idx ON note_metadata (project_id, user_id, updated_at);
