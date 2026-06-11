import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  key: text('key').notNull().unique(),
  workspaceKey: text('workspace_key').notNull(),
  defaultProjectId: text('default_project_id'),
  hostUrl: text('host_url').notNull().default(''),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('member'),
    provisionedByValidationId: text('provisioned_by_validation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
    userIdIdx: index('workspace_members_user_id_idx').on(table.userId),
  }),
);

export const workspaceMemberActivity = pgTable(
  'workspace_member_activity',
  {
    workspaceId: text('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
  }),
);

export const workspaceSettings = pgTable('workspace_settings', {
  workspaceId: text('workspace_id').primaryKey(),
  hostUrl: text('host_url').notNull().default(''),
  joinMode: text('join_mode').notNull().default('approval_required'),
  hierarchyMode: text('hierarchy_mode').$type<'flat' | 'teams'>().notNull().default('flat'),
  disabledMcpTools: jsonb('disabled_mcp_tools').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceInvites = pgTable('workspace_invites', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  code: text('code').notNull().unique(),
  createdBy: text('created_by').notNull(),
  label: text('label').notNull().default(''),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceJoinRequests = pgTable('workspace_join_requests', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  inviteId: text('invite_id'),
  requestingUserId: text('requesting_user_id'),
  requesterName: text('requester_name').notNull(),
  requesterEmail: text('requester_email').notNull(),
  requesterAvatar: text('requester_avatar'),
  message: text('message').notNull().default(''),
  status: text('status').notNull().default('pending'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable('teams', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull().default('#6B7280'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workspaceIdIdx: index('teams_workspace_id_idx').on(table.workspaceId),
}));

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  teamId: text('team_id').notNull().references(() => teams.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  key: text('key').notNull().unique(),
  status: text('status').notNull().default('planned'),
  inviteCode: text('invite_code').notNull().unique(),
  createdBy: text('created_by').notNull(),
  githubRepoUrl: text('github_repo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workspaceIdIdx: index('projects_workspace_id_idx').on(table.workspaceId),
  teamIdIdx: index('projects_team_id_idx').on(table.teamId),
}));

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: text('project_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('developer'),
    provisionedByValidationId: text('provisioned_by_validation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
    userIdIdx: index('project_members_user_id_idx').on(table.userId),
  }),
);

export const domains = pgTable('domains', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  teamId: text('team_id').notNull().references(() => teams.id),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6B7280'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectIdIdx: index('domains_project_id_idx').on(table.projectId),
  teamIdIdx: index('domains_team_id_idx').on(table.teamId),
}));

export const labels = pgTable('labels', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6B7280'),
  description: text('description').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectIdIdx: index('labels_project_id_idx').on(table.projectId),
}));

export const ticketLabels = pgTable('ticket_labels', {
  ticketId: text('ticket_id').notNull(),
  labelId: text('label_id').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.ticketId, table.labelId] }),
  labelIdIdx: index('ticket_labels_label_id_idx').on(table.labelId),
}));


export const cycles = pgTable('cycles', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  teamId: text('team_id').notNull().references(() => teams.id),
  name: text('name').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  completed: boolean('completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectIdIdx: index('cycles_project_id_idx').on(table.projectId),
  teamIdIdx: index('cycles_team_id_idx').on(table.teamId),
}));
