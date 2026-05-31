-- Ensure tickets have a branch_name column for git branch tracking
-- Adds a column if it does not already exist to keep migrations idempotent.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS branch_name TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
