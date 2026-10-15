-- Existing notes were listed only to their authors. Preserve that visibility.
ALTER TABLE note_metadata ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_metadata_visibility_check') THEN
    ALTER TABLE note_metadata ADD CONSTRAINT note_metadata_visibility_check CHECK (visibility IN ('private', 'shared'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS note_metadata_project_visibility_updated_at_idx
  ON note_metadata (project_id, visibility, updated_at);
