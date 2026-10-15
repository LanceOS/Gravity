CREATE TABLE IF NOT EXISTS note_media_deletions (
  bucket_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  note_id TEXT NOT NULL,
  etag TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bucket_path, filename)
);
ALTER TABLE note_media_deletions ADD COLUMN IF NOT EXISTS last_error TEXT;
CREATE INDEX IF NOT EXISTS note_media_deletions_recovery_idx
  ON note_media_deletions (next_attempt_at, bucket_path, filename) WHERE status <> 'confirmed';
