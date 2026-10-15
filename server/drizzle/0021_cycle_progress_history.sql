-- Existing cycles have no trustworthy historical series. Their first tracked
-- transition establishes a baseline and sets progress_tracked_at.
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS progress_tracked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS cycle_progress_events (
  id BIGSERIAL PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  ticket_id TEXT NOT NULL,
  status TEXT,
  delta_total INTEGER NOT NULL,
  delta_completed INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS cycle_progress_daily_deltas (
  cycle_id TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  delta_total INTEGER NOT NULL,
  delta_completed INTEGER NOT NULL,
  PRIMARY KEY (cycle_id, day)
);

CREATE INDEX IF NOT EXISTS cycle_progress_events_cycle_time_idx
  ON cycle_progress_events (cycle_id, recorded_at, id);
