import { bigint, bigserial, index, integer, pgTable, primaryKey, jsonb, text, timestamp, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cycles } from '../workspaces/schema.js';

// No foreign key: deleting a project must not release its external identities.
export const ticketKeyCounters = pgTable('ticket_key_counters', {
  prefix: text('prefix').primaryKey(),
  lastValue: bigint('last_value', { mode: 'bigint' }).notNull(),
});

export const tickets = pgTable('tickets', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('todo'),
  priority: text('priority').notNull().default('no_priority'),
  assigneeId: text('assignee_id'),
  projectId: text('project_id').notNull(),
  cycleId: text('cycle_id').references(() => cycles.id, { onDelete: 'restrict' }),
  parentId: text('parent_id').references((): AnyPgColumn => tickets.id),
  prStatus: text('pr_status').notNull().default('none'),
  prUrl: text('pr_url'),
  branchName: text('branch_name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectIdIdx: index('tickets_project_id_idx').on(table.projectId),
  assigneeIdIdx: index('tickets_assignee_id_idx').on(table.assigneeId),
  cycleIdIdx: index('tickets_cycle_id_idx').on(table.cycleId),
  parentIdIdx: index('tickets_parent_id_idx').on(table.parentId),
}));

// An exit has null status. Ticket IDs intentionally have no FK: deleted tickets
// must remain in the cycle's historical count until their recorded exit.
export const cycleProgressEvents = pgTable('cycle_progress_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  cycleId: text('cycle_id').notNull().references(() => cycles.id, { onDelete: 'cascade' }),
  ticketId: text('ticket_id').notNull(),
  status: text('status'),
  deltaTotal: integer('delta_total').notNull(),
  deltaCompleted: integer('delta_completed').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
}, (table) => ({
  cycleTimeIdx: index('cycle_progress_events_cycle_time_idx').on(table.cycleId, table.recordedAt, table.id),
}));

export const cycleProgressDailyDeltas = pgTable('cycle_progress_daily_deltas', {
  cycleId: text('cycle_id').notNull().references(() => cycles.id, { onDelete: 'cascade' }),
  day: text('day').notNull(), // YYYY-MM-DD in UTC
  deltaTotal: integer('delta_total').notNull(),
  deltaCompleted: integer('delta_completed').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.cycleId, table.day] }),
}));

export const ticketRelationships = pgTable('ticket_relationships', {
  ticketId: text('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  blockedTicketId: text('blocked_ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.ticketId, table.blockedTicketId] }),
  ticketIdIdx: index('ticket_relationships_ticket_id_idx').on(table.ticketId),
  blockedTicketIdIdx: index('ticket_relationships_blocked_ticket_id_idx').on(table.blockedTicketId),
// noSelfRef: check('ticket_relationships_no_self_ref', sql`ticket_id != blocked_ticket_id`),
}));

export interface CommentAutomation {
  provider: 'github';
  deliveryId: string;
  prUrl: string;
  action: string;
  externalAuthor: string;
  externalSender: string;
  source?: 'webhook' | 'reconciliation';
  actorUserId?: string;
  evidence?: string[];
  before?: { status: string; prStatus: string; prUrl: string | null };
  after?: { status: string; prStatus: string; prUrl: string | null };
}

export const comments = pgTable('comments', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  body: text('body').notNull(),
  automation: jsonb('automation').$type<CommentAutomation>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ticketIdIdx: index('comments_ticket_id_idx').on(table.ticketId),
  userIdIdx: index('comments_user_id_idx').on(table.userId),
}));
