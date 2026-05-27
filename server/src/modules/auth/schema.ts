import { boolean, index, primaryKey, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { bytea } from '../../db/types.js';

export const authUsers = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const userExternalCredentials = pgTable('user_external_credentials', {
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  encryptedApiKey: bytea('encrypted_api_key').notNull(),
  encryptedDek: bytea('encrypted_dek').notNull(),
  aesIv: bytea('aes_iv').notNull(),
  aesAuthTag: bytea('aes_auth_tag').notNull(),
  kmsKekId: text('kms_kek_id').notNull(),
  preferredModel: text('preferred_model'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.provider] }),
  userIdIdx: index('user_external_credentials_user_id_idx').on(table.userId),
}));
