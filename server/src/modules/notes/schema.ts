import { customType, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const noteMetadata = pgTable('note_metadata', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  excerpt: text('excerpt').notNull().default(''),
  bucketPath: text('bucket_path').notNull(),
  searchVector: tsvector('search_vector'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectIdUserIdIdx: index('note_metadata_project_id_user_id_idx').on(table.projectId, table.userId),
  projectIdUserIdUpdatedAtIdx: index('note_metadata_project_id_user_id_updated_at_idx').on(table.projectId, table.userId, table.updatedAt),
  searchIdx: index('note_metadata_search_idx').using('gin', table.searchVector),
}));
