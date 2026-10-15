import { customType, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
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
  searchText: text('search_text'),
  searchIndexedVersion: integer('search_indexed_version'),
  bucketPath: text('bucket_path').notNull(),
  bodyKey: text('body_key').notNull().default('body.md'),
  searchVector: tsvector('search_vector'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  bucketPathIdx: index('note_metadata_bucket_path_idx').on(table.bucketPath),
  projectIdUserIdIdx: index('note_metadata_project_id_user_id_idx').on(table.projectId, table.userId),
  projectIdUserIdUpdatedAtIdx: index('note_metadata_project_id_user_id_updated_at_idx').on(table.projectId, table.userId, table.updatedAt),
  searchIdx: index('note_metadata_search_idx').using('gin', table.searchVector),
  searchBackfillIdx: index('note_metadata_search_backfill_idx').on(table.id)
    .where(sql`search_text IS NULL OR COALESCE(search_indexed_version, 0) <> version`),
}));

// Upload intents survive process crashes. Committed revisions are retained for
// readers that already captured an older metadata snapshot.
export const noteBodyRevisions = pgTable('note_body_revisions', {
  bodyKey: text('body_key').primaryKey(),
  bucketPath: text('bucket_path').notNull(),
  state: text('state').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  recoveryIdx: index('note_body_revisions_recovery_idx').on(table.state, table.createdAt),
}));

// Retained tombstones also fence late uploads/publication after note deletion.
export const noteBucketCleanups = pgTable('note_bucket_cleanups', {
  bucketPath: text('bucket_path').primaryKey(),
  noteId: text('note_id').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({ recoveryIdx: index('note_bucket_cleanups_recovery_idx').on(table.nextAttemptAt, table.bucketPath) }));

// A committed claim fences note publication before an object DELETE begins.
// Ambiguous requests retain the fence because a delayed DELETE may still land.
export const noteMediaDeletions = pgTable('note_media_deletions', {
  bucketPath: text('bucket_path').notNull(),
  filename: text('filename').notNull(),
  noteId: text('note_id').notNull(),
  etag: text('etag').notNull(),
  claimId: text('claim_id').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  pk: primaryKey({ columns: [table.bucketPath, table.filename] }),
  recoveryIdx: index('note_media_deletions_recovery_idx').on(table.status, table.nextAttemptAt),
}));
