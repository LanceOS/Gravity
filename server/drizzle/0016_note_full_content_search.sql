ALTER TABLE note_metadata ADD COLUMN IF NOT EXISTS search_text TEXT;
-- Existing bodies live in object storage. Run the application backfill after this
-- migration so every vector is built from the committed body revision.
