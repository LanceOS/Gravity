import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import {
  authUsers,
  comments,
  cycles,
  domains,
  federationInvites,
  peerConnections,
  projectMembers,
  projects,
  syncOutbox,
  tickets,
  userProfiles,
  validations,
  workspaceInvites,
  workspaceJoinRequests,
  workspaceMembers,
  workspaceMemberActivity,
  workspacePeers,
  workspaces,
  workspaceSettings,
} from '../db/schema.js';
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
  listWorkspaceSummaries,
  normalizeEntityKey,
} from '../lib/platform.js';
import { buildProjectKeyConflictMessage, mapProjectCreationError, projectKeyExists } from '../lib/project-creation.js';
import { resolveRequestActorUserId } from '../lib/request-auth.js';

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

export function createWorkspacesRouter() {
  const router = Router();

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

      const workspace = await getWorkspaceSummary(workspaceId, effectiveOwnerId);
      res.status(201).json({ workspace });
    } catch (error) {
      const mappedProjectCreationError = mapProjectCreationError(error);
      if (mappedProjectCreationError) {
        if (mappedProjectCreationError.type === 'key_conflict' && typeof defaultProjectKey === 'string') {
          const normalizedDefaultProjectKey = normalizeEntityKey(defaultProjectKey);
          if (normalizedDefaultProjectKey && (await projectKeyExists(normalizedDefaultProjectKey))) {
            res.status(409).json({ error: buildProjectKeyConflictMessage(normalizedDefaultProjectKey) });
            return;
          }
        }

        res.status(mappedProjectCreationError.status).json({ error: mappedProjectCreationError.message });
        return;
      }

      res.status(500).json({ error: 'Failed to create workspace.' });
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

      // Record activity if active user resolved
      const actorUserId = await resolveRequestActorUserId(req);
      if (actorUserId) {
        await recordWorkspaceActivity(workspaceId, actorUserId);
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

      // Record activity if active user resolved
      const actorUserId = await resolveRequestActorUserId(req);
      if (actorUserId) {
        await recordWorkspaceActivity(workspaceId, actorUserId);
      }

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
            updatedAt: new Date(),
          })
          .where(eq(workspaceSettings.workspaceId, workspaceId));
      });

      res.json(await loadWorkspaceSettingsPayload(workspaceId));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update workspace settings.' });
    }
  });

  router.get('/workspaces/:workspaceId/members', async (req, res) => {
    try {
      const workspaceId = req.params.workspaceId;
      const actorUserId = await resolveRequestActorUserId(req);
      if (actorUserId) {
        await recordWorkspaceActivity(workspaceId, actorUserId);
      }

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
      const actorUserId = resolveRequestActorUserId(req);

      if (!actorUserId) {
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

  router.get('/workspaces/:workspaceId/peer-invites', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const membershipRows = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, req.params.workspaceId), eq(workspaceMembers.userId, actorUserId)))
        .limit(1);
      const membership = membershipRows[0];
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        res.status(403).json({ error: 'Owner or admin access is required.' });
        return;
      }

      await recordWorkspaceActivity(req.params.workspaceId, actorUserId);

      const inviteRows = await db
        .select()
        .from(validations)
        .where(eq(validations.workspaceId, req.params.workspaceId));

      res.json(
        inviteRows
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map((invite) => mapPeerInvite(invite)),
      );
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load peer invites.' });
    }
  });

  router.post('/workspaces/:workspaceId/invites', async (req, res) => {
    const { workspaceId } = req.params;
    const { createdBy, label } = req.body ?? {};
    if (!createdBy) {
      res.status(400).json({ error: 'createdBy is required.' });
      return;
    }

    try {
      const workspaceRows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      const workspace = workspaceRows[0];
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }

      const invite = {
        id: createId('wsi'),
        workspaceId,
        code: createWorkspaceInviteCode(workspace.key),
        createdBy,
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

  router.post('/workspaces/invites', async (req, res) => {
    const workspaceId =
      typeof req.body?.workspace_id === 'string'
        ? req.body.workspace_id
        : typeof req.body?.workspaceId === 'string'
          ? req.body.workspaceId
          : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const expirationHoursRaw = Number(req.body?.expiration_hours ?? req.body?.expirationHours ?? 24);
    const expirationHours = Number.isFinite(expirationHoursRaw) && expirationHoursRaw > 0 ? expirationHoursRaw : 24;

    if (!workspaceId || !email) {
      res.status(400).json({ error: 'workspace_id and email are required.' });
      return;
    }

    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
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
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorUserId)))
        .limit(1);
      const membership = membershipRows[0];
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        res.status(403).json({ error: 'Owner or admin access is required.' });
        return;
      }

      const baseUrl = workspace.hostUrl?.trim() || `${req.protocol}://${req.get('host') ?? 'localhost'}`;
      const inviteUrl = new URL('/api/v1/workspaces/validate', baseUrl).toString();
      const validation = {
        id: createId('val'),
        workspaceId,
        issuedByUserId: actorUserId,
        email,
        inviteUrl,
        validationCode: createValidationCode(),
        workspacePrivateKey: createWorkspacePrivateKey(),
        guestUserId: null,
        guestUsername: null,
        guestPasswordHash: null,
        isUsed: false,
        expiresAt: new Date(Date.now() + expirationHours * 60 * 60 * 1000),
        usedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      };

      await db.insert(validations).values(validation);

      res.status(201).json(mapPeerInvite(validation));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create peer invite.' });
    }
  });

  router.post('/workspaces/:workspaceId/peer-invites/:inviteId/revoke', async (req, res) => {
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
        .from(validations)
        .where(and(eq(validations.id, inviteId), eq(validations.workspaceId, workspaceId)))
        .limit(1);
      const invite = inviteRows[0];

      if (!invite) {
        res.status(404).json({ error: 'Peer invite not found.' });
        return;
      }

      if (invite.revokedAt) {
        res.json(mapPeerInvite(invite));
        return;
      }

      const revokedAt = new Date();
      await db.transaction(async (tx) => {
        await tx.update(validations).set({ revokedAt }).where(eq(validations.id, invite.id));

        if (invite.guestUserId) {
          await tx
            .delete(projectMembers)
            .where(eq(projectMembers.provisionedByValidationId, invite.id));

          await tx
            .delete(workspaceMembers)
            .where(eq(workspaceMembers.provisionedByValidationId, invite.id));
        }
      });

      res.json(mapPeerInvite({ ...invite, revokedAt }));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to revoke peer invite.' });
    }
  });

  router.post('/workspaces/validate', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const validationCode = typeof req.body?.validation_code === 'string' ? req.body.validation_code.trim() : '';
    const inviteUrl = typeof req.body?.invite_url === 'string' ? req.body.invite_url.trim() : '';
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const passwordHash = typeof req.body?.password_hash === 'string' ? req.body.password_hash.trim() : '';

    if (!email || !validationCode || !inviteUrl || !username || !passwordHash) {
      res.status(400).json({ error: 'email, validation_code, invite_url, username, and password_hash are required.' });
      return;
    }

    try {
      const validationRows = await db
        .select()
        .from(validations)
        .where(
          and(
            eq(validations.email, email),
            eq(validations.validationCode, validationCode),
            eq(validations.inviteUrl, inviteUrl),
          ),
        )
        .limit(1);
      const validation = validationRows[0];

      if (!validation || !validation.workspaceId) {
        res.status(401).json({ error: 'Invalid validation request.' });
        return;
      }

      if (validation.revokedAt) {
        res.status(400).json({ error: 'This validation has been revoked.' });
        return;
      }

      if (validation.isUsed || (validation.usedAt && new Date(validation.usedAt).getTime() <= Date.now())) {
        res.status(400).json({ error: 'This validation has already been used.' });
        return;
      }

      if (new Date(validation.expiresAt).getTime() < Date.now()) {
        res.status(400).json({ error: 'This validation has expired.' });
        return;
      }

      const existingUsers = await db.select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
      const existingUser = existingUsers[0];
      const guestUserId = existingUser?.id ?? createId('u');

      if (existingUser) {
        await db
          .update(authUsers)
          .set({
            name: username,
            updatedAt: new Date(),
          })
          .where(eq(authUsers.id, guestUserId));
      } else {
        await db.insert(authUsers).values({
          id: guestUserId,
          name: username,
          email,
          emailVerified: false,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await ensureUserDefaults(guestUserId);
  await ensureWorkspaceMembership(validation.workspaceId, guestUserId, 'member', validation.id);
  await addUserToWorkspaceProjects(validation.workspaceId, guestUserId, 'developer', validation.id);

      await db
        .update(validations)
        .set({
          guestUserId,
          guestUsername: username,
          guestPasswordHash: passwordHash,
          isUsed: true,
          usedAt: new Date(),
        })
        .where(eq(validations.id, validation.id));

      const guestProfile = await getUserById(guestUserId);
      if (!guestProfile) {
        res.status(500).json({ error: 'Failed to provision guest profile.' });
        return;
      }

      res.json({
        authorized: true,
        workspace_private_key: validation.workspacePrivateKey,
        guest_profile: {
          id: guestProfile.id,
          username: guestProfile.name,
          role: guestProfile.role,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to validate workspace invite.' });
    }
  });

  router.post('/workspaces/invites/:inviteCode/join-requests', async (req, res) => {
    const { inviteCode } = req.params;
    const { userId, message } = req.body ?? {};
    if (!userId) {
      res.status(400).json({ error: 'userId is required.' });
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

      const requestId = createId('wsr');
      const workspaceId = String(invite.workspaceId);
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
    try {
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
        .where(eq(workspaceJoinRequests.workspaceId, req.params.workspaceId))
        .orderBy(desc(workspaceJoinRequests.createdAt));

      res.json(joinRequests);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load join requests.' });
    }
  });

  router.post('/workspaces/:workspaceId/join-requests/:requestId/approve', async (req, res) => {
    const { workspaceId, requestId } = req.params;
    const { reviewerUserId } = req.body ?? {};
    if (!reviewerUserId) {
      res.status(400).json({ error: 'reviewerUserId is required.' });
      return;
    }

    try {
      const rows = await db.select().from(workspaceJoinRequests).where(and(eq(workspaceJoinRequests.id, requestId), eq(workspaceJoinRequests.workspaceId, workspaceId))).limit(1);
      const request = rows[0];
      if (!request) {
        res.status(404).json({ error: 'Join request not found.' });
        return;
      }

      await db
        .update(workspaceJoinRequests)
        .set({ status: 'approved', reviewedBy: reviewerUserId, reviewedAt: new Date() })
        .where(eq(workspaceJoinRequests.id, requestId));

      if (request.requestingUserId) {
        await ensureWorkspaceMembership(workspaceId, request.requestingUserId, 'member');
        await addUserToWorkspaceProjects(workspaceId, request.requestingUserId);
      }

      res.json({
        id: requestId,
        status: 'approved',
        reviewedBy: reviewerUserId,
        reviewedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to approve join request.' });
    }
  });

  router.post('/workspaces/connect', async (req, res) => {
    const { userId, workspaceId, workspaceKey } = req.body ?? {};
    if (!userId || !workspaceId || !workspaceKey) {
      res.status(400).json({ error: 'userId, workspaceId, and workspaceKey are required.' });
      return;
    }

    try {
      const workspaceRows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      const workspace = workspaceRows[0];
      if (!workspace || workspace.workspaceKey !== workspaceKey) {
        res.status(401).json({ error: 'Invalid workspace credentials.' });
        return;
      }

      const membershipRows = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
      if (!membershipRows[0]) {
        res.status(403).json({ error: 'User is not a member of this workspace.' });
        return;
      }

      const workspaceProjects = await db.select().from(projects).where(eq(projects.workspaceId, workspaceId));
      res.json({
        workspace: await getWorkspaceSummary(workspaceId, userId),
        projects: workspaceProjects.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
          key: project.key,
          status: project.status,
          workspaceId: project.workspaceId,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to connect workspace.' });
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
        const workspaceProjects = await tx.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspaceId));
        const projectIds = workspaceProjects.map((p) => p.id);

        if (projectIds.length > 0) {
          const projectTickets = await tx.select({ id: tickets.id }).from(tickets).where(inArray(tickets.projectId, projectIds));
          const ticketIds = projectTickets.map((t) => t.id);

          if (ticketIds.length > 0) {
            await tx.delete(comments).where(inArray(comments.ticketId, ticketIds));
          }

          await tx.delete(tickets).where(inArray(tickets.projectId, projectIds));
          await tx.delete(cycles).where(inArray(cycles.projectId, projectIds));
          await tx.delete(domains).where(inArray(domains.projectId, projectIds));
          await tx.delete(projectMembers).where(inArray(projectMembers.projectId, projectIds));
          await tx.delete(projects).where(inArray(projects.id, projectIds));
        }

        await tx.delete(syncOutbox).where(eq(syncOutbox.workspaceId, workspaceId));
        await tx.delete(workspacePeers).where(eq(workspacePeers.workspaceId, workspaceId));
        await tx.delete(federationInvites).where(eq(federationInvites.workspaceId, workspaceId));
        await tx.delete(peerConnections).where(eq(peerConnections.workspaceId, workspaceId));
        await tx.delete(workspaceJoinRequests).where(eq(workspaceJoinRequests.workspaceId, workspaceId));
        await tx.delete(workspaceInvites).where(eq(workspaceInvites.workspaceId, workspaceId));
        await tx.delete(validations).where(eq(validations.workspaceId, workspaceId));
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