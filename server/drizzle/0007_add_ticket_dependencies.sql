CREATE TABLE IF NOT EXISTS "ticket_dependencies" (
  "ticket_id" text NOT NULL REFERENCES "tickets" ("id") ON DELETE CASCADE,
  "blocked_ticket_id" text NOT NULL REFERENCES "tickets" ("id") ON DELETE CASCADE,
  CONSTRAINT "ticket_dependencies_ticket_id_blocked_ticket_id_pk" PRIMARY KEY ("ticket_id", "blocked_ticket_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_dependencies_ticket_id_idx" ON "ticket_dependencies" USING btree ("ticket_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_dependencies_blocked_ticket_id_idx" ON "ticket_dependencies" USING btree ("blocked_ticket_id");
--> statement-breakpoint
INSERT INTO "ticket_dependencies" ("ticket_id", "blocked_ticket_id")
SELECT "blocked_ticket_id", "id"
FROM "tickets"
WHERE "blocked_ticket_id" IS NOT NULL
ON CONFLICT ("ticket_id", "blocked_ticket_id") DO NOTHING;
--> statement-breakpoint
