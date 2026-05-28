import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.js';
import {
  authUsers,
  comments,
  cycles,
  domains,
  projectMembers,
  projects,
  tickets,
  userProfiles,
  workspaceInvites,
  workspaceJoinRequests,
  workspaceMembers,
  workspaceMemberActivity,
  workspaces,
  workspaceSettings,
  mcpConnectionTokens,
} from '../../db/schema.js';
import {
  addUserToWorkspaceProjects,
  createId,
  createProjectInviteCode,
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
  listWorkspaceSummaries,
  normalizeEntityKey,
} from '../../lib/platform.js';
import { createConnectionToken, refreshConnectionToken, revokeConnectionToken } from '../mcp/connection.js';
import { csrfProtect } from '../../lib/csrf.js';
import { createRateLimiter } from '../../lib/rateLimit.js';
import { getRequestSourceIp } from '../../lib/request-ip.js';
import { isWorkspaceMember } from './services/membership.js';
import { mapProjectCreationError } from './utils/project-creation.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { env } from '../../env.js';

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

async function loadWorkspaceSettingsPayload(workspaceId: string) {
  const rows = await db
    .select({
      workspaceId: workspaces.id,
      key: workspaces.key,
      workspaceHostUrl: workspaces.hostUrl,
      settingsHostUrl: workspaceSettings.hostUrl,
      joinMode: workspaceSettings.joinMode,
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
    workspaceKey: settings.workspaceKey,
    defaultProjectId: settings.defaultProjectId,
    disabledMcpTools: settings.disabledMcpTools || [],
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
  token: string;
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
    token: token.rawToken,
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
  const issuanceUserLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 10,
    keyFn: async (req) => {
      const actor = await resolveRequestActorUserId(req);
      const clientIp = getRequestSourceIp(req) ?? req.ip;
      return actor ? `user:${actor}` : `ip:${clientIp}`;
    },
  });
  const issuanceIpLimiter = createRateLimiter({ windowMs: 60_000, max: 60, keyFn: (req) => `ip:${getRequestSourceIp(req) ?? req.ip}` });
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

  router.post('/workspaces', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { name, description, key, workspaceKey, ownerId, defaultProjectName, defaultProjectKey } = req.body ?? {};
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

      const defaultProjectId = defaultProjectName ? createId('p') : null;

      await db.transaction(async (tx) => {
        await tx.insert(workspaces).values({
          id: workspaceId,
          name,
          description: description ?? '',
          key: normalizedWorkspaceKey,
          workspaceKey: resolvedWorkspaceAccessKey,
          hostUrl: '',
          defaultProjectId,
          createdBy: effectiveOwnerId,
          createdAt: new Date(),
        });

        await tx.insert(workspaceSettings).values({
          workspaceId,
          hostUrl: '',
          joinMode: 'approval_required',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await tx.insert(workspaceMembers).values({
          workspaceId,
          userId: effectiveOwnerId,
          role: 'owner',
          createdAt: new Date(),
        });

        if (defaultProjectId && defaultProjectName) {
          const normalizedProjectKey = normalizeEntityKey(defaultProjectKey || defaultProjectName.slice(0, 3).toUpperCase());
          await tx.insert(projects).values({
            id: defaultProjectId,
            workspaceId,
            name: defaultProjectName,
            description: '',
            key: normalizedProjectKey,
            status: 'active',
            inviteCode: createProjectInviteCode(normalizedProjectKey),
            createdBy: effectiveOwnerId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          await tx.insert(projectMembers).values({
            projectId: defaultProjectId,
            userId: effectiveOwnerId,
            role: 'owner',
            createdAt: new Date(),
          });
        }
      });

      await invalidateUserWorkspacesCache(effectiveOwnerId);
      const workspace = await getWorkspaceSummary(workspaceId, effectiveOwnerId);
      res.status(201).json({ workspace });
    } catch (error) {
      const normalizedDefaultProjectKey =
        typeof defaultProjectKey === 'string' && defaultProjectKey.trim().length > 0
          ? normalizeEntityKey(defaultProjectKey)
          : typeof defaultProjectName === 'string' && defaultProjectName.trim().length > 0
            ? normalizeEntityKey(defaultProjectName)
            : normalizeEntityKey(key);
      const mappedProjectCreationError = mapProjectCreationError(error, normalizedDefaultProjectKey);

      res.status(mappedProjectCreationError.status).json({ error: mappedProjectCreationError.message });
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
        const [membership] = await db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.userId, actorUserId),
            ),
          )
          .limit(1);

        if (membership) {
          await recordWorkspaceActivity(workspaceId, actorUserId);
        }
      }

      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load workspace settings.' });
    }
  });

  router.patch('/workspaces/:workspaceId/settings', async (req, res) => {
    const { workspaceId } = req.params;

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

      const membershipRows = await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, actorUserId)
          )
        )
        .limit(1);
      const membership = membershipRows[0];
      if (!membership || membership.role !== 'owner') {
        res.status(403).json({ error: 'Only workspace owners can modify workspace settings.' });
        return;
      }

      await recordWorkspaceActivity(workspaceId, actorUserId);

      const nextHostUrl = typeof req.body?.hostUrl === 'string' ? req.body.hostUrl : currentWorkspace.hostUrl;
      const nextJoinMode = req.body?.joinMode === 'auto_join' ? 'auto_join' : req.body?.joinMode === 'approval_required' ? 'approval_required' : null;
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
            ...(nextDisabledMcpTools !== undefined ? { disabledMcpTools: nextDisabledMcpTools } : {}),
            updatedAt: new Date(),
          })
          .where(eq(workspaceSettings.workspaceId, workspaceId));
      });

      await invalidateWorkspaceCache(workspaceId);
      res.json(await loadWorkspaceSettingsPayload(workspaceId));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update workspace settings.' });
    }
  });

  router.get('/workspaces/:workspaceId/members', async (req, res) => {
    try {
      const workspaceId = req.params.workspaceId;
      const actorUserId = await resolveRequestActorUserId(req);
      if (!actorUserId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const membershipRows = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorUserId)))
        .limit(1);

      if (!membershipRows[0]) {
        res.status(403).json({ error: 'Workspace membership required.' });
        return;
      }

      await recordWorkspaceActivity(workspaceId, actorUserId);

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

      res.json(
        members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          avatar: member.avatarUrl || member.image || '',
          role: member.role,
          createdAt: member.createdAt,
          lastActiveAt: member.lastActiveAt ? member.lastActiveAt.toISOString() : null,
        })),
      );
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load workspace members.' });
    }
  });

  router.get('/workspaces/:workspaceId/members/:userId/activity', async (req, res) => {
    try {
      const { workspaceId, userId } = req.params;
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
      const { workspaceId, userId } = req.params;
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
    const { workspaceId } = req.params;
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

      const membershipRows = await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, actorUserId)
          )
        )
        .limit(1);
      const membership = membershipRows[0];
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        res.status(403).json({ error: 'Owner or admin access is required.' });
        return;
      }

      const invite = {
        id: createId('wsi'),
        workspaceId,
        code: createWorkspaceInviteCode(workspace.key),
        createdBy: actorUserId,
        label: label ?? '',
      };

      await db.insert(workspaceInvites).values({
        ...invite,
        expiresAt: null,
        revokedAt: null,
        maxUses: null,
        useCount: 0,
        createdAt: new Date(),
      });

      res.status(201).json({
        ...invite,
        expiresAt: null,
        revokedAt: null,
        maxUses: null,
        useCount: 0,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create workspace invite.' });
    }
  });

  router.post('/workspaces/:workspaceId/invites/:inviteId/revoke', async (req, res) => {
    const { workspaceId, inviteId } = req.params;
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const membershipRows = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorUserId)))
        .limit(1);
      const membership = membershipRows[0];
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
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
    const { workspaceId } = req.params;
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const member = await isWorkspaceMember(workspaceId, actorUserId);
      if (!member) {
        res.status(403).json({ error: 'Workspace membership required.' });
        return;
      }

      const { scopes, ttlSeconds, singleUse, connectionType } = req.body ?? {};
      const sourceIp = getRequestSourceIp(req);

      const token = await createConnectionToken({
        workspaceId,
        generatedBy: actorUserId,
        scopes: Array.isArray(scopes) ? scopes : undefined,
        ttlSeconds: typeof ttlSeconds === 'number' ? ttlSeconds : undefined,
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create connection token.' });
    }
  });

  router.post('/workspaces/:workspaceId/mcp/connection/:tokenId/refresh', issuanceUserLimiter, issuanceIpLimiter, async (req, res) => {
    const { workspaceId, tokenId } = req.params;
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const member = await isWorkspaceMember(workspaceId, actorUserId);
      if (!member) {
        res.status(403).json({ error: 'Workspace membership required.' });
        return;
      }

      const membershipRows = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorUserId)))
        .limit(1);
      const membership = membershipRows[0];

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

      const isOwnerOrAdmin = membership && ['owner', 'admin'].includes(membership.role);
      if (tokenRow.generatedBy !== actorUserId && !isOwnerOrAdmin) {
        res.status(403).json({ error: 'Insufficient privileges to refresh token.' });
        return;
      }

      if (tokenRow.status !== 'active' || (tokenRow.expiresAt && tokenRow.expiresAt <= new Date())) {
        res.status(400).json({ error: 'Token cannot be refreshed.' });
        return;
      }

      const ttlSeconds = typeof req.body?.ttlSeconds === 'number' ? req.body.ttlSeconds : undefined;
      const sourceIp = getRequestSourceIp(req);
      const token = await refreshConnectionToken(tokenId, actorUserId, { ttlSeconds, sourceIp });

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
    const { workspaceId, tokenId } = req.params;
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const membershipRows = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorUserId)))
        .limit(1);
      const membership = membershipRows[0];

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

      const isOwnerOrAdmin = membership && ['owner', 'admin'].includes(membership.role);
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
    const { workspaceId } = req.params;
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const membershipRows = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorUserId)))
        .limit(1);
      const membership = membershipRows[0];
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
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
    const { inviteCode } = req.params;
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
      if (invite.expiresAt && new Date(String(invite.expiresAt)).getTime() < Date.now()) {
        res.status(400).json({ error: 'This invite has expired.' });
        return;
      }
      if (invite.maxUses && Number(invite.useCount) >= Number(invite.maxUses)) {
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
      const existingMembership = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
        .limit(1);

      if (existingMembership[0]) {
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

      await db.insert(workspaceJoinRequests).values({
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
        reviewedAt: autoJoin ? new Date() : null,
        createdAt: new Date(),
      });

      await db
        .update(workspaceInvites)
        .set({ useCount: Number(invite.useCount) + 1 })
        .where(eq(workspaceInvites.id, String(invite.id)));

      if (autoJoin) {
        await ensureWorkspaceMembership(workspaceId, userId, 'member');
        await addUserToWorkspaceProjects(workspaceId, userId);
      }

      await invalidateWorkspaceCache(workspaceId);
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
        reviewedAt: autoJoin ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create join request.' });
    }
  });

  router.get('/workspaces/:workspaceId/join-requests', async (req, res) => {
    const { workspaceId } = req.params;
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const membershipRows = await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, actorUserId)
          )
        )
        .limit(1);
      const membership = membershipRows[0];
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        res.status(403).json({ error: 'Owner or admin access is required.' });
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
    const { workspaceId, requestId } = req.params;
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const membershipRows = await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, actorUserId)
          )
        )
        .limit(1);
      const membership = membershipRows[0];
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        res.status(403).json({ error: 'Owner or admin access is required.' });
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
      }

      await invalidateWorkspaceCache(workspaceId);
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
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { workspaceId } = req.params;

    try {
      const membershipRows = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorUserId)))
        .limit(1);
      const membership = membershipRows[0];
      
      if (!membership || membership.role !== 'owner') {
        res.status(403).json({ error: 'Only a workspace owner can delete the workspace.' });
        return;
      }

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

        await tx.delete(cycles).where(sql`${cycles.projectId} in (
          select ${projects.id}
          from ${projects}
          where ${projects.workspaceId} = ${workspaceId}
        )`);

        await tx.delete(domains).where(sql`${domains.projectId} in (
          select ${projects.id}
          from ${projects}
          where ${projects.workspaceId} = ${workspaceId}
        )`);

        await tx.delete(projectMembers).where(sql`${projectMembers.projectId} in (
          select ${projects.id}
          from ${projects}
          where ${projects.workspaceId} = ${workspaceId}
        )`);

        await tx.delete(projects).where(eq(projects.workspaceId, workspaceId));

        await tx.delete(workspaceJoinRequests).where(eq(workspaceJoinRequests.workspaceId, workspaceId));
        await tx.delete(workspaceInvites).where(eq(workspaceInvites.workspaceId, workspaceId));
        await tx.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId));
        await tx.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
        await tx.delete(workspaceMemberActivity).where(eq(workspaceMemberActivity.workspaceId, workspaceId));
        
        await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
      });

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete workspace.' });
    }
  });

  return router;
}