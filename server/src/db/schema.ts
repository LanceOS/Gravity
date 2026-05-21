import { boolean, integer, jsonb, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

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
  projectLayout: text('project_layout').notNull().default('standard'),
  encryptedApiKey: text('encrypted_api_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const validations = pgTable('validations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id'),
  issuedByUserId: text('issued_by_user_id'),
  email: text('email').notNull(),
  inviteUrl: text('invite_url').notNull(),
  validationCode: text('validation_code').notNull(),
  workspacePrivateKey: text('workspace_private_key').notNull(),
  guestUserId: text('guest_user_id'),
  guestUsername: text('guest_username'),
  guestPasswordHash: text('guest_password_hash'),
  isUsed: boolean('is_used').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
  }),
);

export const workspaceSettings = pgTable('workspace_settings', {
  workspaceId: text('workspace_id').primaryKey(),
  hostUrl: text('host_url').notNull().default(''),
  joinMode: text('join_mode').notNull().default('approval_required'),
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

export const workspaceConnections = pgTable('workspace_connections', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  label: text('label').notNull(),
  hostUrl: text('host_url').notNull(),
  remoteWorkspaceId: text('remote_workspace_id'),
  remoteWorkspaceKeyHint: text('remote_workspace_key_hint').notNull().default(''),
  status: text('status').notNull().default('saved'),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const identities = pgTable('identities', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  publicKey: text('public_key').notNull().unique(),
  encryptedPrivateKey: text('encrypted_private_key'),
  isLocalOwner: boolean('is_local_owner').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const peerConnections = pgTable('peer_connections', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  hostUrl: text('host_url').notNull(),
  hostDisplayName: text('host_display_name').notNull().default(''),
  hostPublicKey: text('host_public_key').notNull(),
  lastSyncedEventId: integer('last_synced_event_id').notNull().default(0),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const federationInvites = pgTable('federation_invites', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  issuedByUserId: text('issued_by_user_id').notNull(),
  inviteToken: text('invite_token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedByPublicKey: text('accepted_by_public_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspacePeers = pgTable(
  'workspace_peers',
  {
    workspaceId: text('workspace_id').notNull(),
    identityId: text('identity_id').notNull(),
    invitedByUserId: text('invited_by_user_id').notNull(),
    peerHostUrl: text('peer_host_url').notNull().default(''),
    status: text('status').notNull().default('verified'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.identityId] }),
  }),
);

export const syncOutbox = pgTable('sync_outbox', {
  eventId: serial('event_id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  actorPublicKey: text('actor_public_key').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  payload: jsonb('payload').notNull(),
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
});

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
  }),
);

export const domains = pgTable('domains', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6B7280'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cycles = pgTable('cycles', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  completed: boolean('completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
});

export const comments = pgTable('comments', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull(),
  userId: text('user_id').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const schema = {
  authUsers,
  userProfiles,
  userSettings,
  validations,
  workspaces,
  workspaceMembers,
  workspaceSettings,
  workspaceInvites,
  workspaceJoinRequests,
  workspaceConnections,
  identities,
  peerConnections,
  federationInvites,
  workspacePeers,
  syncOutbox,
  projects,
  projectMembers,
  domains,
  cycles,
  tickets,
  comments,
};