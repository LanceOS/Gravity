ALTER TABLE note_metadata ADD COLUMN IF NOT EXISTS body_key TEXT NOT NULL DEFAULT 'body.md';
CREATE TABLE IF NOT EXISTS note_body_revisions (
  body_key TEXT PRIMARY KEY,
  bucket_path TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS note_body_revisions_recovery_idx ON note_body_revisions (state, created_at);
