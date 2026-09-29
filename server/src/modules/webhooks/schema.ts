import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { tickets } from '../tickets/schema.js';

export const githubDeliveries = pgTable('github_deliveries', {
  id: text('id').primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

// A PR can reference many tickets, and a ticket can have several PRs.
export const ticketPullRequests = pgTable('ticket_pull_requests', {
  ticketId: text('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  prUrl: text('pr_url').notNull(),
  repoUrl: text('repo_url').notNull(),
  status: text('status').notNull(),
  phase: text('phase').notNull(),
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }).notNull(),
}, (table) => ({ pk: primaryKey({ columns: [table.ticketId, table.prUrl] }) }));
