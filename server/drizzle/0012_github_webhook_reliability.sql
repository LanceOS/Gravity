CREATE TABLE IF NOT EXISTS github_deliveries (
  id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ticket_pull_requests (
  ticket_id TEXT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  pr_url TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (ticket_id, pr_url)
);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS automation JSONB;
CREATE TABLE IF NOT EXISTS github_pull_requests (
  pr_url TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ NOT NULL
);
