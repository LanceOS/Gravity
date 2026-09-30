CREATE TABLE IF NOT EXISTS note_bucket_cleanups (
  bucket_path TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS note_bucket_cleanups_recovery_idx ON note_bucket_cleanups (next_attempt_at, bucket_path);
CREATE INDEX IF NOT EXISTS note_metadata_bucket_path_idx ON note_metadata (bucket_path);
