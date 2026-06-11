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
CREATE INDEX "projects_team_id_idx" ON "projects" USING btree ("team_id");--> statement-breakpoint
INSERT INTO "teams" ("id", "workspace_id", "name", "description", "color", "created_at", "updated_at")
SELECT 'team-general-' || "id", "id", 'General', 'Default team for workspace', '#6B7280', now(), now()
FROM "workspaces"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "projects"
SET "team_id" = 'team-general-' || "workspace_id"
WHERE "team_id" IS NULL
  OR "team_id" = ''
  OR "team_id" NOT IN (SELECT "id" FROM "teams");--> statement-breakpoint
UPDATE "cycles"
SET "team_id" = "projects"."team_id"
FROM "projects"
WHERE "cycles"."project_id" = "projects"."id"
  AND (
    "cycles"."team_id" IS NULL
    OR "cycles"."team_id" = ''
    OR "cycles"."team_id" NOT IN (SELECT "id" FROM "teams")
  );--> statement-breakpoint
UPDATE "domains"
SET "team_id" = "projects"."team_id"
FROM "projects"
WHERE "domains"."project_id" = "projects"."id"
  AND (
    "domains"."team_id" IS NULL
    OR "domains"."team_id" = ''
    OR "domains"."team_id" NOT IN (SELECT "id" FROM "teams")
  );--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cycles" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
