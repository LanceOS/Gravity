import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.js';
import {
  authUsers,
  comments,
  cycles,
  labels,
  projectMembers,
  projects,
  ticketLabels,
  tickets,
  userProfiles,
  workspaceInvites,
  workspaceJoinRequests,
  workspaceMembers,
  workspaceMemberActivity,
  workspaces,
  workspaceSettings,
  mcpConnectionTokens,
  teams,
} from '../../db/schema.js';
import {
  addUserToWorkspaceProjects,
  createId,
  createWorkspaceAccessKey,
  createWorkspaceInviteCode,
  ensureProjectMembership,
  ensureUserDefaults,
  ensureWorkspaceMembership,
  ensureWorkspaceSettingsRecord,
  getUserById,
  getWorkspaceSummary,
  invalidateUserWorkspacesCache,
  invalidateWorkspaceCache,
  normalizeIsoDate,
  WorkspaceCacheInvalidationReason,
  listWorkspaceSummaries,
  normalizeEntityKey,
} from '../../lib/platform.js';
import { createConnectionToken, refreshConnectionToken, revokeConnectionToken } from '../mcp/connection.js';
import { csrfProtect } from '../../lib/csrf.js';
import { createRateLimiter } from '../../lib/rateLimit.js';
import { createRedisRateLimiter } from '../../lib/rateLimitRedis.js';
import { getRequestSourceIp } from '../../lib/request-ip.js';
import {
  authorizeWorkspaceOwnerAccess,
  authorizeWorkspaceOwnerOrAdminAccess,
  authorizeWorkspaceAccess,
  getWorkspaceMemberRole,
  invalidateWorkspaceMembershipCache,
  invalidateWorkspaceMembershipCaches,
} from './services/membership.js';
import { getSidebarTree } from './services/sidebar.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { toolHandlers } from '../mcp/tool-handlers/registry.js';
import { env } from '../../env.js';

function getParamString(param?: string | string[] | undefined): string {
  if (typeof param === 'string') return param;
  if (Array.isArray(param) && param.length > 0) return param[0];
  return '';
}

const DEFAULT_WORKSPACE_INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WORKSPACE_INVITE_MAX_USES = 1;
const MCP_SCOPE_LIST = 'tools/list';
const MCP_SCOPE_CALL = 'tools/call';
const MCP_SCOPE_CALL_WILDCARD = 'tools/call:*';
const MCP_SCOPE_CALL_PREFIX = 'tools/call:';
const MCP_DEFAULT_CONNECTION_SCOPES = [MCP_SCOPE_LIST];
const MCP_MAX_CONNECTION_TTL_SECONDS = 24 * 60 * 60;

function normalizeMcpScope(rawScope: unknown) {
  return typeof rawScope === 'string' ? rawScope.trim() : '';
}

function normalizeRequestedMcpScopes(rawScopes: unknown) {
  if (!Array.isArray(rawScopes)) {
    return [];
  }

  return Array.from(new Set(rawScopes.map(normalizeMcpScope).filter(Boolean)));
}

function resolveAllowedToolCallScopes() {
  return new Set(Object.keys(toolHandlers));
}

function resolveAuthorizedMcpScopes(rawScopes: unknown, isPrivilegedRequestor: boolean) {
  const requestedScopes = normalizeRequestedMcpScopes(rawScopes);
  const allowedScopes = new Set<string>(MCP_DEFAULT_CONNECTION_SCOPES);
  const invalidScopes: string[] = [];
  const allowedToolNames = resolveAllowedToolCallScopes();

  for (const scope of requestedScopes) {
    if (scope === MCP_SCOPE_LIST) {
      allowedScopes.add(scope);
      continue;
    }

    if (scope === MCP_SCOPE_CALL || scope === MCP_SCOPE_CALL_WILDCARD) {
      if (!isPrivilegedRequestor) {
        invalidScopes.push(scope);
        continue;
      }

      allowedScopes.add(scope);
      continue;
    }

    if (scope.startsWith(MCP_SCOPE_CALL_PREFIX)) {
      if (!isPrivilegedRequestor) {
        invalidScopes.push(scope);
        continue;
      }

      const toolName = scope.slice(MCP_SCOPE_CALL_PREFIX.length);
      if (!toolName || !allowedToolNames.has(toolName)) {
        invalidScopes.push(scope);
        continue;
      }

      allowedScopes.add(scope);
      continue;
    }

    invalidScopes.push(scope);
  }

  if (invalidScopes.length > 0) {
    throw new Error(`Unsupported MCP scopes requested: ${invalidScopes.join(', ')}`);
  }

  return [...allowedScopes];
}

function resolveConnectionTokenTtl(rawTtlSeconds: unknown) {
  if (rawTtlSeconds === undefined) {
    return undefined;
  }

  if (typeof rawTtlSeconds !== 'number' || !Number.isFinite(rawTtlSeconds)) {
    return null;
  }

  if (rawTtlSeconds <= 0) {
    return null;
  }

  const normalized = Math.floor(rawTtlSeconds);
  if (normalized > MCP_MAX_CONNECTION_TTL_SECONDS) {
    return null;
  }

  return normalized;
}

function getDefaultWorkspaceInviteExpiresAt() {
  return new Date(Date.now() + DEFAULT_WORKSPACE_INVITE_TTL_MS);
}

function normalizeWorkspaceInviteMaxUses(rawMaxUses: number | null | undefined): number {
  if (rawMaxUses == null) {
    return DEFAULT_WORKSPACE_INVITE_MAX_USES;
  }

  const parsed = Number(rawMaxUses);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WORKSPACE_INVITE_MAX_USES;
  }

  return Math.min(Math.floor(parsed), DEFAULT_WORKSPACE_INVITE_MAX_USES);
}

async function recordWorkspaceActivity(workspaceId: string, userId: string) {
  try {
    await db
      .insert(workspaceMemberActivity)
      .values({
        workspaceId,
        userId,
        lastActiveAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [workspaceMemberActivity.workspaceId, workspaceMemberActivity.userId],
        set: {
          lastActiveAt: new Date(),
        },
      });
  } catch (error) {
    console.error(`Failed to record workspace activity for user ${userId} in workspace ${workspaceId}:`, error);
  }
}

function createValidationCode() {
  return `GRAV-${Math.floor(1000 + Math.random() * 9000)}-${randomUUID().slice(0, 1).toUpperCase()}`;
}

function createWorkspacePrivateKey() {
  return `sec_wsp_${randomUUID().replace(/-/g, '')}`;
}

function normalizeNullableIsoDate(value: unknown) {
  return value ? normalizeIsoDate(value) : null;
}

function toExportFilenameSegment(value: string) {
  const segment = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return segment || 'workspace';
}

async function loadWorkspaceSettingsPayload(workspaceId: string) {
  const rows = await db
    .select({
      workspaceId: workspaces.id,
      key: workspaces.key,
      workspaceHostUrl: workspaces.hostUrl,
      settingsHostUrl: workspaceSettings.hostUrl,
      joinMode: workspaceSettings.joinMode,
      hierarchyMode: workspaceSettings.hierarchyMode,
      workspaceKey: workspaces.workspaceKey,
      defaultProjectId: workspaces.defaultProjectId,
      disabledMcpTools: workspaceSettings.disabledMcpTools,
    })
    .from(workspaces)
    .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, workspaces.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const settings = rows[0];
  if (!settings) {
    return null;
  }

  return {
    workspaceId: settings.workspaceId,
    key: settings.key,
    hostUrl: settings.settingsHostUrl || settings.workspaceHostUrl || '',
    joinMode: settings.joinMode === 'auto_join' ? 'auto_join' : 'approval_required',
    hierarchyMode: settings.hierarchyMode === 'teams' ? 'teams' : 'flat',
    workspaceKey: settings.workspaceKey,
    defaultProjectId: settings.defaultProjectId,
    disabledMcpTools: settings.disabledMcpTools || [],
  };
}

async function buildWorkspaceTasksExport(workspaceId: string, generatedBy: string) {
  const [workspaceRows, taskRows] = await Promise.all([
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        key: workspaces.key,
        createdAt: workspaces.createdAt,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
    db
      .select({
        id: tickets.id,
        key: tickets.key,
        title: tickets.title,
        description: tickets.description,
        status: tickets.status,
        priority: tickets.priority,
        assigneeId: tickets.assigneeId,
        projectId: tickets.projectId,
        cycleId: tickets.cycleId,
        parentId: tickets.parentId,
        prStatus: tickets.prStatus,
        prUrl: tickets.prUrl,
        branchName: tickets.branchName,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
        projectName: projects.name,
        projectKey: projects.key,
        teamId: teams.id,
        teamName: teams.name,
        cycleName: cycles.name,
        cycleStartDate: cycles.startDate,
        cycleEndDate: cycles.endDate,
        cycleCompleted: cycles.completed,
        assigneeName: authUsers.name,
        assigneeEmail: authUsers.email,
        assigneeImage: authUsers.image,
        assigneeAvatarUrl: userProfiles.avatarUrl,
      })
      .from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .leftJoin(teams, eq(teams.id, projects.teamId))
      .leftJoin(cycles, eq(cycles.id, tickets.cycleId))
      .leftJoin(authUsers, eq(authUsers.id, tickets.assigneeId))
      .leftJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(asc(projects.name), asc(tickets.createdAt), asc(tickets.key)),
  ]);

  const workspace = workspaceRows[0];
  if (!workspace) {
    return null;
  }

  const taskIds = taskRows.map((task) => task.id);
  const [labelRows, commentRows] = taskIds.length > 0
    ? await Promise.all([
        db
          .select({
            ticketId: ticketLabels.ticketId,
            id: labels.id,
            name: labels.name,
            color: labels.color,
            description: labels.description,
            sortOrder: labels.sortOrder,
          })
          .from(ticketLabels)
          .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
          .where(inArray(ticketLabels.ticketId, taskIds))
          .orderBy(asc(ticketLabels.ticketId), asc(labels.sortOrder), asc(labels.name)),
        db
          .select({
            id: comments.id,
            ticketId: comments.ticketId,
            userId: comments.userId,
            body: comments.body,
            createdAt: comments.createdAt,
            userName: authUsers.name,
            userEmail: authUsers.email,
            userImage: authUsers.image,
            userAvatarUrl: userProfiles.avatarUrl,
            authorRole: userProfiles.role,
          })
          .from(comments)
          .innerJoin(authUsers, eq(authUsers.id, comments.userId))
          .leftJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
          .where(inArray(comments.ticketId, taskIds))
          .orderBy(asc(comments.ticketId), asc(comments.createdAt)),
      ])
    : [[], []];

  const labelsByTaskId = new Map<string, Array<{
    id: string;
    name: string;
    color: string;
    description: string;
    sortOrder: number;
  }>>();
  for (const label of labelRows) {
    const taskLabels = labelsByTaskId.get(label.ticketId) ?? [];
    taskLabels.push({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description ?? '',
      sortOrder: Number(label.sortOrder ?? 0),
    });
    labelsByTaskId.set(label.ticketId, taskLabels);
  }

  const commentsByTaskId = new Map<string, Array<{
    id: string;
    body: string;
    createdAt: string;
    author: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string;
      role: string;
    };
  }>>();
  for (const comment of commentRows) {
    const taskComments = commentsByTaskId.get(comment.ticketId) ?? [];
    taskComments.push({
      id: comment.id,
      body: comment.body,
      createdAt: normalizeIsoDate(comment.createdAt),
      author: {
        id: comment.userId,
        name: comment.userName ?? '',
        email: comment.userEmail ?? '',
        avatarUrl: comment.userAvatarUrl ?? comment.userImage ?? '',
        role: comment.authorRole ?? 'guest_contributor',
      },
    });
    commentsByTaskId.set(comment.ticketId, taskComments);
  }

  const generatedAt = new Date().toISOString();

  return {
    export: {
      type: 'workspace_tasks',
      version: 1,
      generatedAt,
      generatedBy,
      taskCount: taskRows.length,
    },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      key: workspace.key,
      createdAt: normalizeIsoDate(workspace.createdAt),
    },
    tasks: taskRows.map((task) => ({
      id: task.id,
      key: task.key,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee: task.assigneeId
        ? {
            id: task.assigneeId,
            name: task.assigneeName ?? '',
            email: task.assigneeEmail ?? '',
            avatarUrl: task.assigneeAvatarUrl ?? task.assigneeImage ?? '',
          }
        : null,
      project: {
        id: task.projectId,
        name: task.projectName,
        key: task.projectKey,
      },
      team: task.teamId
        ? {
            id: task.teamId,
            name: task.teamName ?? '',
          }
        : null,
      cycle: task.cycleId
        ? {
            id: task.cycleId,
            name: task.cycleName ?? '',
            startDate: normalizeNullableIsoDate(task.cycleStartDate),
            endDate: normalizeNullableIsoDate(task.cycleEndDate),
            completed: Boolean(task.cycleCompleted),
          }
        : null,
      parentId: task.parentId,
      prStatus: task.prStatus,
      prUrl: task.prUrl,
      branchName: task.branchName,
      createdAt: normalizeIsoDate(task.createdAt),
      updatedAt: normalizeIsoDate(task.updatedAt),
      labels: labelsByTaskId.get(task.id) ?? [],
      comments: commentsByTaskId.get(task.id) ?? [],
    })),
  };
}

function mapPeerInvite(invite: {
  id: string;
  email: string;
  inviteUrl: string;
  validationCode: string;
  workspacePrivateKey: string;
  expiresAt: Date;
  isUsed: boolean;
  usedAt: Date | null;
  guestUsername: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}) {
  return {
    id: invite.id,
    email: invite.email,
    invite_url: invite.inviteUrl,
    validation_code: invite.validationCode,
    workspace_private_key: invite.workspacePrivateKey,
    expires_at: invite.expiresAt.toISOString(),
    is_used: invite.isUsed,
    used_at: invite.usedAt ? invite.usedAt.toISOString() : null,
    guest_username: invite.guestUsername ?? null,
    created_at: invite.createdAt.toISOString(),
    revoked_at: invite.revokedAt ? invite.revokedAt.toISOString() : null,
  };
}

async function getWorkspaceName(workspaceId: string) {
  const rows = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return rows[0]?.name ?? null;
}

async function getUserEmail(userId: string) {
  const rows = await db.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, userId)).limit(1);
  return rows[0]?.email ?? null;
}

type McpConnectionResponsePayload = {
  id: string;
  type: 'mcp_http';
  expires_at: string;
  scopes: string[];
  single_use: boolean;
  connection_type: string;
  args: {
    mcpEndpoint: string;
    workspaceId: string;
    transport: 'http-post';
    protocol: 'mcp-jsonrpc';
  };
  auth: {
    scheme: 'one_time_token';
    token: string;
    expiresAt: string;
    singleUse: boolean;
    connectionType: string;
  };
  metadata: {
    workspaceName: string | null;
    generatedBy: string;
  };
};

async function buildMcpConnectionResponse(
  token: Awaited<ReturnType<typeof createConnectionToken>>,
  workspaceId: string,
  generatedBy: string,
): Promise<McpConnectionResponsePayload> {
  const [workspaceName, generatedByEmail] = await Promise.all([
    getWorkspaceName(workspaceId),
    getUserEmail(generatedBy),
  ]);

  return {
    id: token.id,
    type: 'mcp_http',
    expires_at: token.expiresAt,
    scopes: token.scopes,
    single_use: token.singleUse,
    connection_type: token.connectionType,
    args: {
      mcpEndpoint: `${env.betterAuthBaseUrl}/api/v1/mcp/sse`,
      workspaceId,
      transport: 'http-post',
      protocol: 'mcp-jsonrpc',
    },
    auth: {
      scheme: 'one_time_token',
      token: token.rawToken,
      expiresAt: token.expiresAt,
      singleUse: token.singleUse,
      connectionType: token.connectionType,
    },
    metadata: {
      workspaceName,
      generatedBy: generatedByEmail ?? generatedBy,
    },
  };
}

export function createWorkspacesRouter() {
  const router = Router();
  // Basic rate limiters: per-user (or per-ip fallback) and per-ip
  const createLimiter = env.redisEnabled ? createRedisRateLimiter : createRateLimiter;
  const issuanceUserLimiter = createLimiter({
    windowMs: 60_000,
    max: 10,
    keyFn: async (req) => {
      const actor = await resolveRequestActorUserId(req);
      const clientIp = getRequestSourceIp(req) ?? req.ip;
      return actor ? `user:${actor}` : `ip:${clientIp}`;
    },
  });
  const issuanceIpLimiter = createLimiter({ windowMs: 60_000, max: 60, keyFn: (req) => `ip:${getRequestSourceIp(req) ?? req.ip}` });
  // Enforce CSRF Origin/Referer checks for state-changing requests by default.
  // `csrfProtect` allows Authorization header or service tokens to bypass when appropriate.
  router.use(csrfProtect());

  router.get('/workspaces', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      if (requestedUserId && requestedUserId !== actorUserId) {
        res.status(403).json({ error: 'Forbidden.' });
        return;
      }

      const workspaceList = await listWorkspaceSummaries(actorUserId);
      res.json(workspaceList);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load workspaces.' });
    }
  });

  router.get('/workspaces/:workspaceId/sidebar', async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId is required.' });
      return;
    }
    const auth = await authorizeWorkspaceAccess(req, workspaceId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const sidebarTree = await getSidebarTree(workspaceId);
      res.json(sidebarTree);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to retrieve sidebar tree.' });
    }
  });

  router.post('/workspaces', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { name, description, key, workspaceKey, ownerId, hierarchyMode } = req.body ?? {};
    if (!name || !key) {
      res.status(400).json({ error: 'Workspace name and key are required.' });
      return;
    }

    if (typeof ownerId === 'string' && ownerId !== actorUserId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    try {
      const effectiveOwnerId = actorUserId;
      const workspaceId = createId('w');
      const normalizedWorkspaceKey = normalizeEntityKey(key);
      const resolvedWorkspaceAccessKey = workspaceKey?.trim() || createWorkspaceAccessKey(normalizedWorkspaceKey);

      await db.transaction(async (tx) => {
        await tx.insert(workspaces).values({
          id: workspaceId,
          name,
          description: description ?? '',
          key: normalizedWorkspaceKey,
          workspaceKey: resolvedWorkspaceAccessKey,
          hostUrl: '',
          defaultProjectId: null,
          createdBy: effectiveOwnerId,
          createdAt: new Date(),
        });

        await tx.insert(workspaceSettings).values({
          workspaceId,
          hostUrl: '',
          joinMode: 'approval_required',
          hierarchyMode: hierarchyMode === 'teams' ? 'teams' : 'flat',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await tx.insert(workspaceMembers).values({
          workspaceId,
          userId: effectiveOwnerId,
          role: 'owner',
          createdAt: new Date(),
        });
      });

      await invalidateUserWorkspacesCache(effectiveOwnerId);
      await invalidateWorkspaceMembershipCache(workspaceId, effectiveOwnerId);
      const workspace = await getWorkspaceSummary(workspaceId, effectiveOwnerId);
      res.status(201).json({ workspace });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create workspace.' });
    }
  });

  router.get('/workspaces/:workspaceId', async (req, res) => {
    try {
      const workspaceId = req.params.workspaceId;
      const workspace = await getWorkspaceSummary(workspaceId);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }

      // Record activity if active user resolved
      const actorUserId = await resolveRequestActorUserId(req);
      if (actorUserId) {
        await recordWorkspaceActivity(workspaceId, actorUserId);
      }

      res.json(workspace);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load workspace.' });
    }
  });

  router.get('/workspaces/:workspaceId/settings', async (req, res) => {
    try {
      const workspaceId = req.params.workspaceId;
      await ensureWorkspaceSettingsRecord(workspaceId);
      const settings = await loadWorkspaceSettingsPayload(workspaceId);

      if (!settings) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }

    // Record activity only for authenticated workspace members
    const actorUserId = await resolveRequestActorUserId(req);
    if (actorUserId) {
      const membershipRole = await getWorkspaceMemberRole(workspaceId, actorUserId);
      if (membershipRole !== null) {
        await recordWorkspaceActivity(workspaceId, actorUserId);
      }
    }

      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load workspace settings.' });
    }
  });

  router.patch('/workspaces/:workspaceId/settings', async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    if (!workspaceId) {
      res.status(400).json({ error: 'Invalid workspace id.' });
      return;
    }

    try {
      await ensureWorkspaceSettingsRecord(workspaceId);
      const workspaceRows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      const currentWorkspace = workspaceRows[0];
      if (!currentWorkspace) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }

      const actorUserId = await resolveRequestActorUserId(req);
      if (!actorUserId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const auth = await authorizeWorkspaceOwnerAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      await recordWorkspaceActivity(workspaceId, actorUserId);

      const nextHostUrl = typeof req.body?.hostUrl === 'string' ? req.body.hostUrl : currentWorkspace.hostUrl;
      const nextJoinMode = req.body?.joinMode === 'auto_join' ? 'auto_join' : req.body?.joinMode === 'approval_required' ? 'approval_required' : null;
      const nextHierarchyMode =
        req.body?.hierarchyMode === 'teams'
          ? 'teams'
          : req.body?.hierarchyMode === 'flat'
            ? 'flat'
            : null;
      const nextWorkspaceKey =
        typeof req.body?.workspaceKey === 'string' && req.body.workspaceKey.trim()
          ? req.body.workspaceKey.trim()
          : currentWorkspace.workspaceKey;
      const nextDefaultProjectId =
        typeof req.body?.defaultProjectId === 'string' && req.body.defaultProjectId.trim()
          ? req.body.defaultProjectId.trim()
          : req.body?.defaultProjectId === null
            ? null
            : currentWorkspace.defaultProjectId;
      const nextDisabledMcpTools: string[] | undefined = Array.isArray(req.body?.disabledMcpTools)
        ? Array.from(
            new Set(
              req.body.disabledMcpTools
                .filter((tool: unknown): tool is string => typeof tool === 'string')
                .map((tool: string) => tool.trim())
                .filter((tool: string) => tool.length > 0)
            )
          )
        : undefined;

      await db.transaction(async (tx) => {
        await tx
          .update(workspaces)
          .set({
            hostUrl: nextHostUrl,
            workspaceKey: nextWorkspaceKey,
            defaultProjectId: nextDefaultProjectId,
          })
          .where(eq(workspaces.id, workspaceId));

        await tx
          .update(workspaceSettings)
          .set({
            hostUrl: nextHostUrl,
            ...(nextJoinMode ? { joinMode: nextJoinMode } : {}),
            ...(nextHierarchyMode ? { hierarchyMode: nextHierarchyMode } : {}),
            ...(nextDisabledMcpTools !== undefined ? { disabledMcpTools: nextDisabledMcpTools } : {}),
            updatedAt: new Date(),
          })
          .where(eq(workspaceSettings.workspaceId, workspaceId));
      });

      await invalidateWorkspaceCache(workspaceId, WorkspaceCacheInvalidationReason.WORKSPACE_SETTINGS_CHANGED);
      res.json(await loadWorkspaceSettingsPayload(workspaceId));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update workspace settings.' });
    }
  });

  router.get('/workspaces/:workspaceId/export/tasks', async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    if (!workspaceId) {
      res.status(400).json({ error: 'Invalid workspace id.' });
      return;
    }

    try {
      const auth = await authorizeWorkspaceAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      if (auth.workspaceRole !== 'owner') {
        res.status(403).json({ error: 'Only workspace owners can export tasks.' });
        return;
      }

      const payload = await buildWorkspaceTasksExport(workspaceId, auth.userId);
      if (!payload) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }

      const filename = `gravity-${toExportFilenameSegment(payload.workspace.key)}-tasks-${payload.export.generatedAt.slice(0, 10)}.json`;
      res.set('Cache-Control', 'no-store');
      res.set('Pragma', 'no-cache');
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Disposition', `attachment; filename="${filename}"`);
      res.type('application/json');
      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to export workspace tasks.' });
    }
  });

  router.get('/workspaces/:workspaceId/members', async (req, res) => {
    try {
      const workspaceId = req.params.workspaceId;
      const auth = await authorizeWorkspaceAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      await recordWorkspaceActivity(workspaceId, auth.userId);

      const members = await db
        .select({
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
          image: authUsers.image,
          avatarUrl: userProfiles.avatarUrl,
          role: workspaceMembers.role,
          createdAt: workspaceMembers.createdAt,
          lastActiveAt: workspaceMemberActivity.lastActiveAt,
        })
        .from(workspaceMembers)
        .innerJoin(authUsers, eq(authUsers.id, workspaceMembers.userId))
        .leftJoin(userProfiles, eq(userProfiles.userId, workspaceMembers.userId))
        .leftJoin(
          workspaceMemberActivity,
          and(
            eq(workspaceMemberActivity.workspaceId, workspaceMembers.workspaceId),
            eq(workspaceMemberActivity.userId, workspaceMembers.userId)
          )
        )
        .where(eq(workspaceMembers.workspaceId, req.params.workspaceId))
        .orderBy(asc(workspaceMembers.createdAt));

      const workspaceOwnerRows = await db
        .select({ ownerId: workspaces.createdBy })
        .from(workspaces)
        .where(eq(workspaces.id, req.params.workspaceId))
        .limit(1);

      const ownerId = workspaceOwnerRows[0]?.ownerId;

      const normalizedMembers = members.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        avatar: member.avatarUrl || member.image || '',
        role: member.role,
        createdAt: member.createdAt,
        lastActiveAt: member.lastActiveAt ? member.lastActiveAt.toISOString() : null,
      }));

      let resolvedMembers = normalizedMembers;
      if (ownerId) {
        const ownerMember = resolvedMembers.find((member) => member.id === ownerId);
        if (ownerMember) {
          if (ownerMember.role !== 'owner') {
            resolvedMembers = resolvedMembers.map((member) =>
              member.id === ownerId ? { ...member, role: 'owner' } : member,
            );
          }
        } else {
          const ownerRecords = await db
            .select({
              id: authUsers.id,
              name: authUsers.name,
              email: authUsers.email,
              image: authUsers.image,
              avatarUrl: userProfiles.avatarUrl,
              createdAt: workspaceMembers.createdAt,
              lastActiveAt: workspaceMemberActivity.lastActiveAt,
            })
            .from(authUsers)
            .leftJoin(
              workspaceMembers,
              and(
                eq(workspaceMembers.userId, authUsers.id),
                eq(workspaceMembers.workspaceId, req.params.workspaceId),
              ),
            )
            .leftJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
            .leftJoin(
              workspaceMemberActivity,
              and(
                eq(workspaceMemberActivity.workspaceId, req.params.workspaceId),
                eq(workspaceMemberActivity.userId, authUsers.id),
              ),
            )
            .where(eq(authUsers.id, ownerId))
            .limit(1);

          const ownerRecord = ownerRecords[0];
          if (ownerRecord) {
            resolvedMembers = [
              {
                id: ownerRecord.id,
                name: ownerRecord.name,
                email: ownerRecord.email,
                avatar: ownerRecord.avatarUrl || ownerRecord.image || '',
                role: 'owner',
                createdAt: ownerRecord.createdAt || new Date(),
                lastActiveAt: ownerRecord.lastActiveAt ? ownerRecord.lastActiveAt.toISOString() : null,
              },
              ...resolvedMembers,
            ];
          }
        }
      }

      res.json(
        resolvedMembers.map((member) => ({
          ...member,
          createdAt: member.createdAt.toISOString(),
        })),
      );
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load workspace members.' });
    }
  });

  router.get('/workspaces/:workspaceId/members/:userId/activity', async (req, res) => {
    try {
      const workspaceId = getParamString(req.params.workspaceId);
      const userId = getParamString(req.params.userId);
      if (!workspaceId || !userId) {
        res.status(400).json({ error: 'Invalid workspace id or user id.' });
        return;
      }
      const rows = await db
        .select()
        .from(workspaceMemberActivity)
        .where(
          and(
            eq(workspaceMemberActivity.workspaceId, workspaceId),
            eq(workspaceMemberActivity.userId, userId)
          )
        )
        .limit(1);

      const activity = rows[0];
      if (!activity) {
        res.json({ workspaceId, userId, lastActiveAt: null });
        return;
      }

      res.json({
        workspaceId: activity.workspaceId,
        userId: activity.userId,
        lastActiveAt: activity.lastActiveAt.toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get workspace activity.' });
    }
  });

  router.post('/workspaces/:workspaceId/members/:userId/activity', async (req, res) => {
    try {
      const workspaceId = getParamString(req.params.workspaceId);
      const userId = getParamString(req.params.userId);
      if (!workspaceId || !userId) {
        res.status(400).json({ error: 'Invalid workspace id or user id.' });
        return;
      }
      const actorUserId = await resolveRequestActorUserId(req);

      if (typeof actorUserId !== 'string' || actorUserId.length === 0) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const memberships = await db
        .select({
          userId: workspaceMembers.userId,
          role: workspaceMembers.role,
        })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            inArray(workspaceMembers.userId, [actorUserId, userId])
          )
        );

      const actorMembership = memberships.find((membership) => membership.userId === actorUserId);
      const targetMembership = memberships.find((membership) => membership.userId === userId);

      if (!targetMembership) {
        res.status(404).json({ error: 'User is not a member of this workspace.' });
        return;
      }

      if (!actorMembership) {
        res.status(403).json({ error: 'You are not a member of this workspace.' });
        return;
      }

      const canRecordForTarget =
        actorUserId === userId ||
        actorMembership.role === 'owner' ||
        actorMembership.role === 'admin';

      if (!canRecordForTarget) {
        res.status(403).json({ error: 'You are not allowed to record activity for this user.' });
        return;
      }

      await recordWorkspaceActivity(workspaceId, userId);

      const rows = await db
        .select()
        .from(workspaceMemberActivity)
        .where(
          and(
            eq(workspaceMemberActivity.workspaceId, workspaceId),
            eq(workspaceMemberActivity.userId, userId)
          )
        )
        .limit(1);

      res.json({
        success: true,
        workspaceId,
        userId,
        lastActiveAt: rows[0]?.lastActiveAt ? rows[0].lastActiveAt.toISOString() : new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to record workspace activity.' });
    }
  });

  router.get('/workspaces/:workspaceId/invites', async (req, res) => {
    try {
      const invites = await db
        .select({
          id: workspaceInvites.id,
          code: workspaceInvites.code,
          label: workspaceInvites.label,
          expiresAt: workspaceInvites.expiresAt,
          revokedAt: workspaceInvites.revokedAt,
          maxUses: workspaceInvites.maxUses,
          useCount: workspaceInvites.useCount,
          createdAt: workspaceInvites.createdAt,
          createdByName: authUsers.name,
        })
        .from(workspaceInvites)
        .innerJoin(authUsers, eq(authUsers.id, workspaceInvites.createdBy))
        .where(eq(workspaceInvites.workspaceId, req.params.workspaceId))
        .orderBy(desc(workspaceInvites.createdAt));

      const inviteIds = invites.map((invite) => invite.id);
      const pendingJoinRequestCounts = inviteIds.length
        ? await db
            .select({
              inviteId: workspaceJoinRequests.inviteId,
              count: sql<number>`count(*)`,
            })
            .from(workspaceJoinRequests)
            .where(and(inArray(workspaceJoinRequests.inviteId, inviteIds), eq(workspaceJoinRequests.status, 'pending')))
            .groupBy(workspaceJoinRequests.inviteId)
        : [];

      const pendingJoinRequestCountByInviteId = new Map(
        pendingJoinRequestCounts.flatMap((row) => (row.inviteId ? [[row.inviteId, Number(row.count ?? 0)] as const] : [])),
      );

      res.json(
        invites.map((invite) => ({
          ...invite,
          pendingJoinRequestCount: pendingJoinRequestCountByInviteId.get(invite.id) ?? 0,
        })),
      );
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load workspace invites.' });
    }
  });



  router.post('/workspaces/:workspaceId/invites', async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    if (!workspaceId) {
      res.status(400).json({ error: 'Invalid workspace id.' });
      return;
    }
    const { label } = req.body ?? {};

    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const workspaceRows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      const workspace = workspaceRows[0];
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }

      const auth = await authorizeWorkspaceOwnerOrAdminAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      const expiresAt = getDefaultWorkspaceInviteExpiresAt();
      const invite = {
        id: createId('wsi'),
        workspaceId,
        code: createWorkspaceInviteCode(workspace.key),
        createdBy: actorUserId,
        label: label ?? '',
        expiresAt,
        maxUses: DEFAULT_WORKSPACE_INVITE_MAX_USES,
      };

      await db.insert(workspaceInvites).values({
        ...invite,
        expiresAt,
        revokedAt: null,
        maxUses: DEFAULT_WORKSPACE_INVITE_MAX_USES,
        useCount: 0,
        createdAt: new Date(),
      });

      res.status(201).json({
        ...invite,
        expiresAt: invite.expiresAt.toISOString(),
        revokedAt: null,
        maxUses: DEFAULT_WORKSPACE_INVITE_MAX_USES,
        useCount: 0,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create workspace invite.' });
    }
  });

  router.post('/workspaces/:workspaceId/invites/:inviteId/revoke', async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    const inviteId = getParamString(req.params.inviteId);
    if (!workspaceId || !inviteId) {
      res.status(400).json({ error: 'Invalid workspace id or invite id.' });
      return;
    }
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const auth = await authorizeWorkspaceAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      if (auth.workspaceRole !== 'owner' && auth.workspaceRole !== 'admin') {
        res.status(403).json({ error: 'Owner or admin access is required.' });
        return;
      }

      const inviteRows = await db
        .select()
        .from(workspaceInvites)
        .where(and(eq(workspaceInvites.id, inviteId), eq(workspaceInvites.workspaceId, workspaceId)))
        .limit(1);
      const invite = inviteRows[0];

      if (!invite) {
        res.status(404).json({ error: 'Invite not found.' });
        return;
      }

      if (invite.revokedAt) {
        res.json(invite);
        return;
      }

      const revokedAt = new Date();
      await db
        .update(workspaceInvites)
        .set({ revokedAt })
        .where(eq(workspaceInvites.id, invite.id));

      res.json({ ...invite, revokedAt });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to revoke invite.' });
    }
  });

  // Create a short-lived MCP connection token bound to this workspace.
  router.post('/workspaces/:workspaceId/mcp/connection', issuanceUserLimiter, issuanceIpLimiter, async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    if (!workspaceId) {
      res.status(400).json({ error: 'Invalid workspace id.' });
      return;
    }
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const auth = await authorizeWorkspaceAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      if (auth.workspaceRole === null) {
        res.status(403).json({ error: 'Workspace membership required.' });
        return;
      }

      const { scopes, ttlSeconds, singleUse, connectionType } = req.body ?? {};
      const resolvedTtlSeconds = resolveConnectionTokenTtl(ttlSeconds);
      if (resolvedTtlSeconds === null) {
        res
          .status(400)
          .json({ error: `Invalid ttlSeconds. Must be a positive number of seconds up to ${MCP_MAX_CONNECTION_TTL_SECONDS}.` });
        return;
      }
      const sourceIp = getRequestSourceIp(req);
      const isPrivilegedRequestor = auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin';
      let resolvedScopes: string[];

      try {
        resolvedScopes = resolveAuthorizedMcpScopes(scopes, isPrivilegedRequestor);
      } catch (scopeError) {
        res.status(400).json({ error: scopeError instanceof Error ? scopeError.message : 'Invalid token scopes.' });
        return;
      }

      const token = await createConnectionToken({
        workspaceId,
        generatedBy: actorUserId,
        scopes: resolvedScopes,
        ttlSeconds: resolvedTtlSeconds,
        singleUse: singleUse === false ? false : true,
        connectionType: typeof connectionType === 'string' ? connectionType : 'http-post',
        sourceIp,
      });

      const response = await buildMcpConnectionResponse(token, workspaceId, actorUserId);
      // Security: prevent token values from being stored in caches or exposed in referrers
      res.set('Cache-Control', 'no-store');
      res.set('Pragma', 'no-cache');
      res.set('Referrer-Policy', 'no-referrer');
      res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
      res.status(201).json(response);
    } catch (error) {
      // Log error for debugging
      // eslint-disable-next-line no-console
      console.error('Error creating MCP connection token:', error);
      res.status(500).json({ error: 'Failed to create connection token.' });
    }
  });

  router.post('/workspaces/:workspaceId/mcp/connection/:tokenId/refresh', issuanceUserLimiter, issuanceIpLimiter, async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    const tokenId = getParamString(req.params.tokenId);
    if (!workspaceId || !tokenId) {
      res.status(400).json({ error: 'Invalid workspace id or token id.' });
      return;
    }
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const auth = await authorizeWorkspaceAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      if (auth.workspaceRole === null) {
        res.status(403).json({ error: 'Workspace membership required.' });
        return;
      }

      const tokenRows = await db
        .select()
        .from(mcpConnectionTokens)
        .where(and(eq(mcpConnectionTokens.id, tokenId), eq(mcpConnectionTokens.workspaceId, workspaceId)))
        .limit(1);
      const tokenRow = tokenRows[0];
      if (!tokenRow) {
        res.status(404).json({ error: 'Token not found.' });
        return;
      }

      const isOwnerOrAdmin = auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin';
      if (tokenRow.generatedBy !== actorUserId && !isOwnerOrAdmin) {
        res.status(403).json({ error: 'Insufficient privileges to refresh token.' });
        return;
      }

      if (tokenRow.status !== 'active' || (tokenRow.expiresAt && tokenRow.expiresAt <= new Date())) {
        res.status(400).json({ error: 'Token cannot be refreshed.' });
        return;
      }

      const resolvedTtlSeconds = resolveConnectionTokenTtl(req.body?.ttlSeconds);
      if (resolvedTtlSeconds === null) {
        res
          .status(400)
          .json({ error: `Invalid ttlSeconds. Must be a positive number of seconds up to ${MCP_MAX_CONNECTION_TTL_SECONDS}.` });
        return;
      }
      const sourceIp = getRequestSourceIp(req);
      const token = await refreshConnectionToken(tokenId, actorUserId, { ttlSeconds: resolvedTtlSeconds, sourceIp });

      if (!token) {
        res.status(400).json({ error: 'Token could not be refreshed.' });
        return;
      }

      const response = await buildMcpConnectionResponse(token, workspaceId, actorUserId);
      // Security: ensure one-time token responses are not cached or leaked
      res.set('Cache-Control', 'no-store');
      res.set('Pragma', 'no-cache');
      res.set('Referrer-Policy', 'no-referrer');
      res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to refresh connection token.' });
    }
  });

  router.post('/workspaces/:workspaceId/mcp/connection/:tokenId/revoke', issuanceUserLimiter, issuanceIpLimiter, async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    const tokenId = getParamString(req.params.tokenId);
    if (!workspaceId || !tokenId) {
      res.status(400).json({ error: 'Invalid workspace id or token id.' });
      return;
    }
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const auth = await authorizeWorkspaceAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      // Allow revoke if token owner or workspace owner/admin
      const tokenRows = await db
        .select()
        .from(mcpConnectionTokens)
        .where(and(eq(mcpConnectionTokens.id, tokenId), eq(mcpConnectionTokens.workspaceId, workspaceId)))
        .limit(1);
      const token = tokenRows[0];
      if (!token) {
        res.status(404).json({ error: 'Token not found.' });
        return;
      }

      const isOwnerOrAdmin = auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin';
      if (token.generatedBy !== actorUserId && !isOwnerOrAdmin) {
        res.status(403).json({ error: 'Insufficient privileges to revoke token.' });
        return;
      }

      await revokeConnectionToken(tokenId, actorUserId);
      res.json({ id: tokenId, revoked_at: new Date().toISOString() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to revoke token.' });
    }
  });

  // List MCP connection tokens (metadata only) for a workspace - owner/admin only
  router.get('/workspaces/:workspaceId/mcp/connections', async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    if (!workspaceId) {
      res.status(400).json({ error: 'Invalid workspace id.' });
      return;
    }
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const auth = await authorizeWorkspaceAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      if (auth.workspaceRole !== 'owner' && auth.workspaceRole !== 'admin') {
        res.status(403).json({ error: 'Owner or admin access is required.' });
        return;
      }

      const rows = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.workspaceId, workspaceId)).orderBy(desc(mcpConnectionTokens.createdAt));

      res.json(
        rows.map((r) => ({
          id: r.id,
          generatedBy: r.generatedBy,
          scopes: r.scopes,
          singleUse: r.singleUse,
          status: r.status,
          connectionType: r.connectionType,
          createdAt: r.createdAt ? r.createdAt.toISOString() : null,
          expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
          usedAt: r.usedAt ? r.usedAt.toISOString() : null,
          revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
        })),
      );
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list connection tokens.' });
    }
  });

  router.post('/workspaces/invites/:inviteCode/join-requests', async (req, res) => {
    const inviteCode = Array.isArray(req.params.inviteCode) ? req.params.inviteCode[0] : (req.params.inviteCode as string);
    const { message } = req.body ?? {};
    const userId = await resolveRequestActorUserId(req);
    
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const inviteRows = await db
        .select({
          id: workspaceInvites.id,
          workspaceId: workspaceInvites.workspaceId,
          revokedAt: workspaceInvites.revokedAt,
          expiresAt: workspaceInvites.expiresAt,
          maxUses: workspaceInvites.maxUses,
          useCount: workspaceInvites.useCount,
          joinMode: workspaceSettings.joinMode,
        })
        .from(workspaceInvites)
        .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, workspaceInvites.workspaceId))
        .where(eq(workspaceInvites.code, inviteCode))
        .limit(1);
      const invite = inviteRows[0];
      if (!invite) {
        res.status(404).json({ error: 'Invite not found.' });
        return;
      }

      if (invite.revokedAt) {
        res.status(400).json({ error: 'This invite has been revoked.' });
        return;
      }
      const normalizedMaxUses = normalizeWorkspaceInviteMaxUses(invite.maxUses);
      const inviteExpiresAt = invite.expiresAt
        ? new Date(String(invite.expiresAt))
        : getDefaultWorkspaceInviteExpiresAt();

      if (inviteExpiresAt.getTime() < Date.now()) {
        res.status(400).json({ error: 'This invite has expired.' });
        return;
      }

      if (normalizedMaxUses && Number(invite.useCount) >= normalizedMaxUses) {
        res.status(400).json({ error: 'This invite has reached its usage limit.' });
        return;
      }

      const user = await getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const workspaceId = String(invite.workspaceId);

      // Check if user is already a member of the workspace
      const existingMembership = await getWorkspaceMemberRole(workspaceId, userId);

      if (existingMembership !== null) {
        res.status(200).json({
          id: '',
          workspaceId,
          requestingUserId: userId,
          requesterName: user.name,
          requesterEmail: user.email,
          requesterAvatar: user.avatar || null,
          message: 'Already a member',
          status: 'approved',
          reviewedBy: null,
          reviewedAt: null,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const requestId = createId('wsr');
      const autoJoin = invite.joinMode === 'auto_join';
      const requestCreatedAt = new Date();

      try {
        await db.transaction(async (tx) => {
          const consumeRows = await tx
            .update(workspaceInvites)
            .set({
              expiresAt: inviteExpiresAt,
              maxUses: normalizedMaxUses,
              useCount: sql`${workspaceInvites.useCount} + 1`,
            })
            .where(
              and(
                eq(workspaceInvites.id, String(invite.id)),
                isNull(workspaceInvites.revokedAt),
                invite.expiresAt ? sql`${workspaceInvites.expiresAt} > NOW()` : sql`true`,
                sql`${workspaceInvites.useCount} < ${normalizedMaxUses}`,
              ),
            )
            .returning({ id: workspaceInvites.id });

          if (consumeRows.length === 0) {
            throw new Error('INVITE_USAGE_LIMIT');
          }

          await tx.insert(workspaceJoinRequests).values({
            id: requestId,
            workspaceId,
            inviteId: String(invite.id),
            requestingUserId: userId,
            requesterName: user.name,
            requesterEmail: user.email,
            requesterAvatar: user.avatar || null,
            message: message ?? '',
            status: autoJoin ? 'approved' : 'pending',
            reviewedBy: autoJoin ? userId : null,
            reviewedAt: autoJoin ? requestCreatedAt : null,
            createdAt: requestCreatedAt,
          });

          if (autoJoin) {
            await ensureWorkspaceMembership(workspaceId, userId, 'member', undefined, tx);
            await addUserToWorkspaceProjects(workspaceId, userId, 'developer', undefined, tx);
          }
        });
      } catch (consumeError) {
        if (consumeError instanceof Error && consumeError.message === 'INVITE_USAGE_LIMIT') {
          res.status(400).json({ error: 'This invite has reached its usage limit.' });
          return;
        }
        throw consumeError;
      }

      await invalidateWorkspaceCache(
        workspaceId,
        autoJoin
          ? WorkspaceCacheInvalidationReason.MEMBERSHIP_CHANGED
          : WorkspaceCacheInvalidationReason.WORKSPACE_JOIN_REQUESTS_UPDATED,
      );
      if (autoJoin) {
        await invalidateWorkspaceMembershipCache(workspaceId, userId);
      }
      if (autoJoin) {
        await invalidateUserWorkspacesCache(userId);
      }

      res.status(201).json({
        id: requestId,
        workspaceId,
        requestingUserId: userId,
        requesterName: user.name,
        requesterEmail: user.email,
        requesterAvatar: user.avatar || null,
        message: message ?? '',
        status: autoJoin ? 'approved' : 'pending',
        reviewedBy: autoJoin ? userId : null,
        reviewedAt: autoJoin ? requestCreatedAt.toISOString() : null,
        createdAt: requestCreatedAt.toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create join request.' });
    }
  });

  router.get('/workspaces/:workspaceId/join-requests', async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    if (!workspaceId) {
      res.status(400).json({ error: 'Invalid workspace id.' });
      return;
    }
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const auth = await authorizeWorkspaceOwnerOrAdminAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      const joinRequests = await db
        .select({
          id: workspaceJoinRequests.id,
          requestingUserId: workspaceJoinRequests.requestingUserId,
          requesterName: workspaceJoinRequests.requesterName,
          requesterEmail: workspaceJoinRequests.requesterEmail,
          requesterAvatar: workspaceJoinRequests.requesterAvatar,
          message: workspaceJoinRequests.message,
          status: workspaceJoinRequests.status,
          reviewedBy: workspaceJoinRequests.reviewedBy,
          reviewedByName: authUsers.name,
          reviewedAt: workspaceJoinRequests.reviewedAt,
          createdAt: workspaceJoinRequests.createdAt,
        })
        .from(workspaceJoinRequests)
        .leftJoin(authUsers, eq(authUsers.id, workspaceJoinRequests.reviewedBy))
        .where(eq(workspaceJoinRequests.workspaceId, workspaceId))
        .orderBy(desc(workspaceJoinRequests.createdAt));

      res.json(joinRequests);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load join requests.' });
    }
  });

  router.post('/workspaces/:workspaceId/join-requests/:requestId/approve', async (req, res) => {
    const workspaceId = getParamString(req.params.workspaceId);
    const requestId = getParamString(req.params.requestId);
    if (!workspaceId || !requestId) {
      res.status(400).json({ error: 'Invalid workspace id or request id.' });
      return;
    }
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const auth = await authorizeWorkspaceOwnerOrAdminAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }

      const rows = await db.select().from(workspaceJoinRequests).where(and(eq(workspaceJoinRequests.id, requestId), eq(workspaceJoinRequests.workspaceId, workspaceId))).limit(1);
      const request = rows[0];
      if (!request) {
        res.status(404).json({ error: 'Join request not found.' });
        return;
      }

      await db
        .update(workspaceJoinRequests)
        .set({ status: 'approved', reviewedBy: actorUserId, reviewedAt: new Date() })
        .where(eq(workspaceJoinRequests.id, requestId));

      if (request.requestingUserId) {
        await ensureWorkspaceMembership(workspaceId, request.requestingUserId, 'member');
        await addUserToWorkspaceProjects(workspaceId, request.requestingUserId);
        await invalidateWorkspaceMembershipCache(workspaceId, request.requestingUserId);
      }

      await invalidateWorkspaceCache(
        workspaceId,
        request.requestingUserId
          ? WorkspaceCacheInvalidationReason.MEMBERSHIP_CHANGED
          : WorkspaceCacheInvalidationReason.WORKSPACE_JOIN_REQUESTS_UPDATED,
      );
      if (request.requestingUserId) {
        await invalidateUserWorkspacesCache(request.requestingUserId);
      }

      res.json({
        id: requestId,
        status: 'approved',
        reviewedBy: actorUserId,
        reviewedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to approve join request.' });
    }
  });



  router.delete('/workspaces/:workspaceId', async (req, res) => {
    const workspaceId = Array.isArray(req.params.workspaceId) ? req.params.workspaceId[0] : (req.params.workspaceId as string);

    try {
      const auth = await authorizeWorkspaceAccess(req, workspaceId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
      if (auth.workspaceRole !== 'owner') {
        res.status(403).json({ error: 'Only a workspace owner can delete the workspace.' });
        return;
      }

      const membershipRows = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId));

      await db.transaction(async (tx) => {
        await tx.delete(comments).where(sql`${comments.ticketId} in (
          select ${tickets.id}
          from ${tickets}
          inner join ${projects} on ${tickets.projectId} = ${projects.id}
          where ${projects.workspaceId} = ${workspaceId}
        )`);

        await tx.delete(tickets).where(sql`${tickets.projectId} in (
          select ${projects.id}
          from ${projects}
          where ${projects.workspaceId} = ${workspaceId}
        )`);

        await tx.delete(ticketLabels).where(sql`${ticketLabels.labelId} in (
          select ${labels.id}
          from ${labels}
          inner join ${teams} on ${labels.teamId} = ${teams.id}
          where ${teams.workspaceId} = ${workspaceId}
        )`);

        await tx.delete(cycles).where(sql`${cycles.teamId} in (
          select ${teams.id}
          from ${teams}
          where ${teams.workspaceId} = ${workspaceId}
        )`);

        await tx.delete(projectMembers).where(sql`${projectMembers.projectId} in (
          select ${projects.id}
          from ${projects}
          where ${projects.workspaceId} = ${workspaceId}
        )`);

        await tx.delete(projects).where(eq(projects.workspaceId, workspaceId));
        await tx.delete(teams).where(eq(teams.workspaceId, workspaceId));

        await tx.delete(workspaceJoinRequests).where(eq(workspaceJoinRequests.workspaceId, workspaceId));
        await tx.delete(workspaceInvites).where(eq(workspaceInvites.workspaceId, workspaceId));
        await tx.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId));
        await tx.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
        await tx.delete(workspaceMemberActivity).where(eq(workspaceMemberActivity.workspaceId, workspaceId));
        
        await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
      });
      const workspaceUserIds = [...new Set(membershipRows.map((member) => member.userId))];
      await Promise.all([
        invalidateWorkspaceMembershipCaches(workspaceId, workspaceUserIds),
        ...workspaceUserIds.map((memberUserId) => invalidateUserWorkspacesCache(memberUserId)),
      ]);

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete workspace.' });
    }
  });

  return router;
}
