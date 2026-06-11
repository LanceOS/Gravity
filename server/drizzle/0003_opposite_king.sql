CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cycles" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "github_repo_url" text;--> statement-breakpoint
CREATE INDEX "teams_workspace_id_idx" ON "teams" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cycles_team_id_idx" ON "cycles" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "domains_team_id_idx" ON "domains" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "projects_team_id_idx" ON "projects" USING btree ("team_id");