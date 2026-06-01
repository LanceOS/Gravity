CREATE TABLE "user_external_credentials" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_api_key" "bytea" NOT NULL,
	"encrypted_dek" "bytea" NOT NULL,
	"aes_iv" "bytea" NOT NULL,
	"aes_auth_tag" "bytea" NOT NULL,
	"kms_kek_id" text NOT NULL,
	"preferred_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_external_credentials_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "mcp_connection_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"hmac_key_id" text DEFAULT 'env' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"single_use" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"generated_by" text NOT NULL,
	"source_ip" text,
	"connection_type" text DEFAULT 'http-post' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "note_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"bucket_path" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "federation_invites" CASCADE;--> statement-breakpoint
DROP TABLE "identities" CASCADE;--> statement-breakpoint
DROP TABLE "peer_connections" CASCADE;--> statement-breakpoint
DROP TABLE "sync_outbox" CASCADE;--> statement-breakpoint
DROP TABLE "validations" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_connections" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_peers" CASCADE;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "branch_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "disabled_mcp_tools" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "user_external_credentials_user_id_idx" ON "user_external_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_connection_tokens_workspace_id_idx" ON "mcp_connection_tokens" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "mcp_connection_tokens_workspace_id_token_hash_idx" ON "mcp_connection_tokens" USING btree ("workspace_id","token_hash");--> statement-breakpoint
CREATE INDEX "note_metadata_project_id_user_id_idx" ON "note_metadata" USING btree ("project_id","user_id");