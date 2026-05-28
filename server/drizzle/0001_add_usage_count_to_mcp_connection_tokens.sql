-- Add usage_count column to mcp_connection_tokens for multi-use tracking
ALTER TABLE "mcp_connection_tokens" ADD COLUMN IF NOT EXISTS "usage_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
