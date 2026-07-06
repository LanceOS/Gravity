import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey(),
  role: text('role').notNull().default('guest_contributor'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey(),
  tutorialCompleted: boolean('tutorial_completed').notNull().default(false),
  theme: text('theme').notNull().default('dark'),
  defaultView: text('default_view').notNull().default('board'),
  aiProvider: text('ai_provider').notNull().default('openai'),
  projectLayout: text('project_layout').notNull().default('standard'),
  encryptedApiKey: text('encrypted_api_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
