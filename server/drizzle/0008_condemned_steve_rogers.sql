CREATE TABLE "ticket_dependencies" (
	"ticket_id" text NOT NULL,
	"blocked_ticket_id" text NOT NULL,
	CONSTRAINT "ticket_dependencies_ticket_id_blocked_ticket_id_pk" PRIMARY KEY("ticket_id","blocked_ticket_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_blocked_ticket_id_tickets_id_fk" FOREIGN KEY ("blocked_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_dependencies_ticket_id_idx" ON "ticket_dependencies" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_dependencies_blocked_ticket_id_idx" ON "ticket_dependencies" USING btree ("blocked_ticket_id");