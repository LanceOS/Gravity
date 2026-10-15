ALTER TABLE note_metadata ADD COLUMN IF NOT EXISTS search_text TEXT;
ALTER TABLE note_metadata ADD COLUMN IF NOT EXISTS search_indexed_version INTEGER;
CREATE INDEX IF NOT EXISTS note_metadata_search_backfill_idx ON note_metadata (id)
  WHERE search_text IS NULL OR COALESCE(search_indexed_version, 0) <> version;
-- Existing bodies live in object storage. Run the application backfill after this
-- migration so every vector is built from the committed body revision.
