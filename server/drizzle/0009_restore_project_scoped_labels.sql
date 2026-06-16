ALTER TABLE "labels" ADD COLUMN IF NOT EXISTS "project_id" text;--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "labels_team_name_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "labels_project_name_unique_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "labels_project_id_idx" ON "labels" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "labels_team_name_unique_idx" ON "labels" USING btree ("team_id","name") WHERE "project_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "labels_project_name_unique_idx" ON "labels" USING btree ("project_id","name") WHERE "project_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "labels" ("id", "project_id", "team_id", "name", "color", "description", "sort_order", "created_at")
SELECT DISTINCT
  "labels"."id" || ':' || "tickets"."project_id",
  "tickets"."project_id",
  "projects"."team_id",
  "labels"."name",
  "labels"."color",
  "labels"."description",
  "labels"."sort_order",
  "labels"."created_at"
FROM "ticket_labels"
INNER JOIN "labels" ON "labels"."id" = "ticket_labels"."label_id"
INNER JOIN "tickets" ON "tickets"."id" = "ticket_labels"."ticket_id"
INNER JOIN "projects" ON "projects"."id" = "tickets"."project_id"
INNER JOIN "workspace_settings" ON "workspace_settings"."workspace_id" = "projects"."workspace_id"
WHERE "labels"."project_id" IS NULL
  AND "workspace_settings"."hierarchy_mode" = 'flat'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_labels" ("ticket_id", "label_id")
SELECT "ticket_labels"."ticket_id", "ticket_labels"."label_id" || ':' || "tickets"."project_id"
FROM "ticket_labels"
INNER JOIN "tickets" ON "tickets"."id" = "ticket_labels"."ticket_id"
INNER JOIN "projects" ON "projects"."id" = "tickets"."project_id"
INNER JOIN "workspace_settings" ON "workspace_settings"."workspace_id" = "projects"."workspace_id"
INNER JOIN "labels" ON "labels"."id" = "ticket_labels"."label_id"
WHERE "labels"."project_id" IS NULL
  AND "workspace_settings"."hierarchy_mode" = 'flat'
  AND EXISTS (
    SELECT 1
    FROM "labels" "project_labels"
    WHERE "project_labels"."id" = "ticket_labels"."label_id" || ':' || "tickets"."project_id"
      AND "project_labels"."project_id" = "tickets"."project_id"
  )
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "ticket_labels"
USING "tickets", "projects", "workspace_settings", "labels"
WHERE "ticket_labels"."ticket_id" = "tickets"."id"
  AND "tickets"."project_id" = "projects"."id"
  AND "workspace_settings"."workspace_id" = "projects"."workspace_id"
  AND "ticket_labels"."label_id" = "labels"."id"
  AND "labels"."project_id" IS NULL
  AND "workspace_settings"."hierarchy_mode" = 'flat'
  AND EXISTS (
    SELECT 1
    FROM "labels" "project_labels"
    WHERE "project_labels"."id" = "labels"."id" || ':' || "tickets"."project_id"
      AND "project_labels"."project_id" = "tickets"."project_id"
  );--> statement-breakpoint
DELETE FROM "labels"
USING "teams", "workspace_settings"
WHERE "labels"."project_id" IS NULL
  AND "labels"."team_id" = "teams"."id"
  AND "workspace_settings"."workspace_id" = "teams"."workspace_id"
  AND "workspace_settings"."hierarchy_mode" = 'flat'
  AND NOT EXISTS (
    SELECT 1
    FROM "ticket_labels"
    WHERE "ticket_labels"."label_id" = "labels"."id"
  )
  AND EXISTS (
    SELECT 1
    FROM "labels" "project_labels"
    WHERE "project_labels"."project_id" IS NOT NULL
      AND substring("project_labels"."id" from 1 for length("labels"."id") + 1) = "labels"."id" || ':'
  );--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'labels'
      AND constraint_name = 'labels_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_flat_workspace_team_scoped_labels"()
RETURNS trigger AS $$
BEGIN
  IF NEW."project_id" IS NULL AND EXISTS (
    SELECT 1
    FROM "teams"
    INNER JOIN "workspace_settings" ON "workspace_settings"."workspace_id" = "teams"."workspace_id"
    WHERE "teams"."id" = NEW."team_id"
      AND "workspace_settings"."hierarchy_mode" = 'flat'
  ) THEN
    RAISE EXCEPTION 'Project ID is required to create labels in project-based workspaces.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS "labels_require_project_scope_for_flat_workspaces" ON "labels";--> statement-breakpoint
CREATE TRIGGER "labels_require_project_scope_for_flat_workspaces"
BEFORE INSERT OR UPDATE OF "team_id", "project_id"
ON "labels"
FOR EACH ROW
EXECUTE FUNCTION "prevent_flat_workspace_team_scoped_labels"();
