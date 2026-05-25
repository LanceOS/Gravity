import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const authUsers = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

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
  ollamaEndpoint: text('ollama_endpoint').notNull().default('http://host.docker.internal:11434'),
  preferredOllamaModel: text('preferred_ollama_model'),
  aiProvider: text('ai_provider').notNull().default('openai'),
  agentIntegration: text('agent_integration').notNull().default('ollama'),
  projectLayout: text('project_layout').notNull().default('standard'),
  encryptedApiKey: text('encrypted_api_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});



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



export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  key: text('key').notNull().unique(),
  status: text('status').notNull().default('planned'),
  inviteCode: text('invite_code').notNull().unique(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workspaceIdIdx: index('projects_workspace_id_idx').on(table.workspaceId),
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
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6B7280'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectIdIdx: index('domains_project_id_idx').on(table.projectId),
}));

export const cycles = pgTable('cycles', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  completed: boolean('completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectIdIdx: index('cycles_project_id_idx').on(table.projectId),
}));

export const tickets = pgTable('tickets', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('todo'),
  priority: text('priority').notNull().default('no_priority'),
  assigneeId: text('assignee_id'),
  projectId: text('project_id').notNull(),
  domainId: text('domain_id'),
  cycleId: text('cycle_id'),
  parentId: text('parent_id'),
  prStatus: text('pr_status').notNull().default('none'),
  prUrl: text('pr_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectIdIdx: index('tickets_project_id_idx').on(table.projectId),
  assigneeIdIdx: index('tickets_assignee_id_idx').on(table.assigneeId),
  domainIdIdx: index('tickets_domain_id_idx').on(table.domainId),
  cycleIdIdx: index('tickets_cycle_id_idx').on(table.cycleId),
  parentIdIdx: index('tickets_parent_id_idx').on(table.parentId),
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

export const schema = {
  authUsers,
  userProfiles,
  userSettings,
  workspaces,
  workspaceMembers,
  workspaceMemberActivity,
  workspaceSettings,
  workspaceInvites,
  workspaceJoinRequests,
  projects,
  projectMembers,
  domains,
  cycles,
  tickets,
  comments,
};