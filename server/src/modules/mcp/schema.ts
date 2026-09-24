import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

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
    workspaceTokenHashIdx: index('mcp_connection_tokens_workspace_id_token_hash_idx').on(
      table.workspaceId,
      table.tokenHash,
    ),
  }),
);

export const mcpOAuthClients = pgTable('mcp_oauth_clients', {
  id: text('id').primaryKey(),
  metadata: jsonb('metadata').$type<OAuthClientInformationFull>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mcpOAuthRequests = pgTable('mcp_oauth_requests', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => mcpOAuthClients.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').notNull(),
  resource: text('resource').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  state: text('state'),
  codeChallenge: text('code_challenge').notNull(),
  requestedScopes: jsonb('requested_scopes').$type<string[]>().notNull(),
  approvedScopes: jsonb('approved_scopes').$type<string[]>(),
  actorUserId: text('actor_user_id'),
  sessionId: text('session_id'),
  status: text('status').notNull().default('pending'),
  codeHash: text('code_hash').unique(),
  codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mcpOAuthGrants = pgTable('mcp_oauth_grants', {
  connectionId: text('connection_id').primaryKey().references(() => mcpConnectionTokens.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().references(() => mcpOAuthClients.id, { onDelete: 'cascade' }),
  resource: text('resource').notNull(),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
});

export const mcpOAuthRefreshTokens = pgTable('mcp_oauth_refresh_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  connectionId: text('connection_id').notNull().references(() => mcpOAuthGrants.connectionId, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export default {};
