ALTER TABLE "domains" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "cycles_project_id_idx";--> statement-breakpoint
DROP INDEX "labels_project_id_idx";--> statement-breakpoint
DROP INDEX "tickets_domain_id_idx";--> statement-breakpoint
ALTER TABLE "cycles" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN IF NOT EXISTS "team_id" text;--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
UPDATE "labels"
SET "team_id" = "projects"."team_id"
FROM "projects"
WHERE "labels"."project_id" = "projects"."id"
  AND ("labels"."team_id" IS NULL OR "labels"."team_id" = '');--> statement-breakpoint
INSERT INTO "labels" ("id", "project_id", "team_id", "name", "color", "description", "sort_order", "created_at")
SELECT "domains"."id", "domains"."project_id", COALESCE("domains"."team_id", "projects"."team_id"), "domains"."name", "domains"."color", '', 0, "domains"."created_at"
FROM "domains"
LEFT JOIN "projects" ON "domains"."project_id" = "projects"."id"
WHERE COALESCE("domains"."team_id", "projects"."team_id") IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_labels" ("ticket_id", "label_id")
SELECT "tickets"."id", "domains"."id"
FROM "tickets"
INNER JOIN "domains" ON "domains"."id" = "tickets"."domain_id"
LEFT JOIN "projects" ON "domains"."project_id" = "projects"."id"
WHERE "tickets"."domain_id" IS NOT NULL
  AND "tickets"."domain_id" <> ''
  AND COALESCE("domains"."team_id", "projects"."team_id") IS NOT NULL
ON CONFLICT ("ticket_id", "label_id") DO NOTHING;--> statement-breakpoint
WITH duplicate_labels AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "team_id", "name" ORDER BY "created_at", "id") AS rn,
    FIRST_VALUE("id") OVER (PARTITION BY "team_id", "name" ORDER BY "created_at", "id") AS canonical_id
  FROM "labels"
  WHERE "team_id" IS NOT NULL
)
UPDATE "ticket_labels"
SET "label_id" = duplicate_labels.canonical_id
FROM duplicate_labels
WHERE "ticket_labels"."label_id" = duplicate_labels."id"
  AND duplicate_labels.rn > 1;--> statement-breakpoint
WITH duplicate_labels AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "team_id", "name" ORDER BY "created_at", "id") AS rn
  FROM "labels"
  WHERE "team_id" IS NOT NULL
)
DELETE FROM "labels"
USING duplicate_labels
WHERE "labels"."id" = duplicate_labels."id"
  AND duplicate_labels.rn > 1;--> statement-breakpoint
DROP TABLE "domains" CASCADE;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "labels_team_id_idx" ON "labels" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_team_name_unique_idx" ON "labels" USING btree ("team_id", "name");--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cycles" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "labels" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "domain_id";
