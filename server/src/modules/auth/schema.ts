import { boolean, index, primaryKey, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { bytea } from '../../db/types.js';

export const authUsers = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  tutorial_completed: boolean('tutorial_completed').default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const authSessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => authUsers.id),
}, (table) => {
  return {
    userIdIdx: index('session_userId_idx').on(table.userId),
  };
});

export const authAccounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => authUsers.id),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
}, (table) => {
  return {
    userIdIdx: index('account_userId_idx').on(table.userId),
  };
});

export const authVerifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }),
  updatedAt: timestamp('updatedAt', { withTimezone: true }),
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
