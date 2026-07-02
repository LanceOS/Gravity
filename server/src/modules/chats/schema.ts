import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { authUsers } from '../auth/schema.js';
import { projects, teams } from '../workspaces/schema.js';

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New Chat'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdUserIdUpdatedAtIdx: index('chat_sessions_project_id_user_id_updated_at_idx').on(
      table.projectId,
      table.userId,
      table.updatedAt,
    ),
  }),
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role')
      .notNull()
      .$type<'user' | 'assistant' | 'system'>(),
    content: text('content').notNull(),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    roleCheck: check('chat_messages_role_check', sql`${table.role} IN ('user', 'assistant', 'system')`),
    sessionIdIdx: index('chat_messages_session_id_idx').on(table.sessionId),
    sessionIdCreatedAtIdx: index('chat_messages_session_id_created_at_idx').on(table.sessionId, table.createdAt),
  }),
);
