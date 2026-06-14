ALTER TABLE "tickets" ADD COLUMN "blocked_ticket_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_team_name_unique_idx" ON "labels" USING btree ("team_id","name");--> statement-breakpoint
CREATE INDEX "tickets_blocked_ticket_id_idx" ON "tickets" USING btree ("blocked_ticket_id");