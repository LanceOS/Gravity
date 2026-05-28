import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const mcpConnectionTokens = pgTable(
  'mcp_connection_tokens',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    hmacKeyId: text('hmac_key_id').notNull().default('env'),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    singleUse: boolean('single_use').notNull().default(true),
    status: text('status').notNull().default('active'),
    generatedBy: text('generated_by').notNull(),
    sourceIp: text('source_ip'),
    connectionType: text('connection_type').notNull().default('http-post'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    usageCount: integer('usage_count').notNull().default(0),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    workspaceIdIdx: index('mcp_connection_tokens_workspace_id_idx').on(table.workspaceId),
    tokenHashIdx: index('mcp_connection_tokens_token_hash_idx').on(table.tokenHash),
  }),
);

export default {};
