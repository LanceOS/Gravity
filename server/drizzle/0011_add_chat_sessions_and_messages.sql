CREATE TABLE IF NOT EXISTS "chat_sessions" (
  "id" text PRIMARY KEY,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" text NOT NULL DEFAULT 'New Chat',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" text PRIMARY KEY,
  "session_id" text NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
  "role" text NOT NULL CHECK ("role" IN ('user', 'assistant', 'system')),
  "content" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chat_sessions_project_id_user_id_updated_at_idx
  ON "chat_sessions" ("project_id", "user_id", "updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx
  ON "chat_messages" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chat_messages_session_id_created_at_idx
  ON "chat_messages" ("session_id", "created_at");
