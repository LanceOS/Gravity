ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_key_key;--> statement-breakpoint
DROP INDEX IF EXISTS projects_workspace_id_key_idx;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS projects_workspace_id_key_idx ON projects USING btree (workspace_id, "key");--> statement-breakpoint
