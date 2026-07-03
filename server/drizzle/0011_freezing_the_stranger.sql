CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_role_check" CHECK ("chat_messages"."role" IN ('user', 'assistant', 'system'))
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"team_id" text,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New Chat' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_dependencies" RENAME TO "ticket_relationships";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_key_unique";--> statement-breakpoint
ALTER TABLE "ticket_relationships" DROP CONSTRAINT "ticket_dependencies_ticket_id_tickets_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_relationships" DROP CONSTRAINT "ticket_dependencies_blocked_ticket_id_tickets_id_fk";
--> statement-breakpoint
DROP INDEX "ticket_dependencies_ticket_id_idx";--> statement-breakpoint
DROP INDEX "ticket_dependencies_blocked_ticket_id_idx";--> statement-breakpoint
DROP INDEX "tickets_blocked_ticket_id_idx";--> statement-breakpoint
DROP INDEX "labels_team_name_unique_idx";--> statement-breakpoint
DROP INDEX "labels_project_name_unique_idx";--> statement-breakpoint
ALTER TABLE "ticket_relationships" DROP CONSTRAINT "ticket_dependencies_ticket_id_blocked_ticket_id_pk";--> statement-breakpoint
ALTER TABLE "ticket_relationships" ADD CONSTRAINT "ticket_relationships_ticket_id_blocked_ticket_id_pk" PRIMARY KEY("ticket_id","blocked_ticket_id");--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "tutorial_completed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ticket_relationships" ADD COLUMN "project_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_relationships" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_project_id_user_id_updated_at_idx" ON "chat_sessions" USING btree ("project_id","user_id","updated_at");--> statement-breakpoint
ALTER TABLE "ticket_relationships" ADD CONSTRAINT "ticket_relationships_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_relationships" ADD CONSTRAINT "ticket_relationships_blocked_ticket_id_tickets_id_fk" FOREIGN KEY ("blocked_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_id_key_idx" ON "projects" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "ticket_relationships_ticket_id_idx" ON "ticket_relationships" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_relationships_blocked_ticket_id_idx" ON "ticket_relationships" USING btree ("blocked_ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_team_name_unique_idx" ON "labels" USING btree ("team_id","name") WHERE "labels"."project_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_project_name_unique_idx" ON "labels" USING btree ("project_id","name") WHERE "labels"."project_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "blocked_ticket_id";