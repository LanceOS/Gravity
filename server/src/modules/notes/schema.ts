import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const noteMetadata = pgTable('note_metadata', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  bucketPath: text('bucket_path').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectIdUserIdIdx: index('note_metadata_project_id_user_id_idx').on(table.projectId, table.userId),
}));
