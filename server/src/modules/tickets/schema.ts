import { index, pgTable, primaryKey, text, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const tickets = pgTable('tickets', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('todo'),
  priority: text('priority').notNull().default('no_priority'),
  assigneeId: text('assignee_id'),
  projectId: text('project_id').notNull(),
  cycleId: text('cycle_id'),
  parentId: text('parent_id'),
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

export const comments = pgTable('comments', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull(),
  userId: text('user_id').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ticketIdIdx: index('comments_ticket_id_idx').on(table.ticketId),
  userIdIdx: index('comments_user_id_idx').on(table.userId),
}));
