import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import {
  authUsers,
  projects,
  validations,
  workspaceInvites,
  workspaceJoinRequests,
  workspaceMembers,
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
import { resolveRequestActorUserId } from '../lib/request-auth.js';

function createValidationCode() {
  return `GRAV-${Math.floor(1000 + Math.random() * 9000)}-${randomUUID().slice(0, 1).toUpperCase()}`;
}

function createWorkspacePrivateKey() {
  return `sec_wsp_${randomUUID().replace(/-/g, '')}`;
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
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const workspaceList = await listWorkspaceSummaries(userId);
      res.json(workspaceList);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load workspaces.' });
    }
  });

  router.post('/workspaces', async (req, res) => {
    const { name, description, key, workspaceKey, ownerId, defaultProjectName, defaultProjectKey } = req.body ?? {};
    if (!name || !key || !ownerId) {
      res.status(400).json({ error: 'Workspace name, key, and ownerId are required.' });
      return;
    }

    try {
      const workspaceId = createId('w');
      const projectId = createId('p');
      const normalizedWorkspaceKey = normalizeEntityKey(key);
      const resolvedWorkspaceAccessKey = workspaceKey?.trim() || createWorkspaceAccessKey(normalizedWorkspaceKey);
      const resolvedProjectKey = normalizeEntityKey(defaultProjectKey || key);

      await db.transaction(async (tx) => {
        await tx.insert(workspaces).values({
          id: workspaceId,
          name,
          description: description ?? '',
          key: normalizedWorkspaceKey,
          workspaceKey: resolvedWorkspaceAccessKey,
          defaultProjectId: projectId,
          hostUrl: '',
          createdBy: ownerId,
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
          userId: ownerId,
          role: 'owner',
          createdAt: new Date(),
        });

        await tx.insert(projects).values({
          id: projectId,
          workspaceId,
          name: defaultProjectName?.trim() || name,
          description: description ?? '',
          key: resolvedProjectKey,
          status: 'active',
          inviteCode: createProjectInviteCode(resolvedProjectKey),
          createdBy: ownerId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      await ensureProjectMembership(projectId, ownerId, 'owner');
      const workspace = await getWorkspaceSummary(workspaceId, ownerId);
      res.status(201).json({ workspace });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create workspace.';
      res.status(/duplicate|unique/i.test(message) ? 400 : 500).json({ error: message });
    }
  });

  router.get('/workspaces/:workspaceId', async (req, res) => {
    try {
      const workspace = await getWorkspaceSummary(req.params.workspaceId);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
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
      const result = await db.execute({
        sql: `
          SELECT
            w.id AS "workspaceId",
            w.key,
            COALESCE(ws.host_url, w.host_url, '') AS "hostUrl",
            COALESCE(ws.join_mode, 'approval_required') AS "joinMode",
            w.workspace_key AS "workspaceKey",
            w.default_project_id AS "defaultProjectId"
          FROM workspaces w
          LEFT JOIN workspace_settings ws ON ws.workspace_id = w.id
          WHERE w.id = $1
          LIMIT 1
        `,
        params: [workspaceId],
      } as never);
      const settings = (result.rows as Array<Record<string, unknown>>)[0];

      if (!settings) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
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

      const result = await db.execute({
        sql: `
          SELECT
            w.id AS "workspaceId",
            w.key,
            COALESCE(ws.host_url, w.host_url, '') AS "hostUrl",
            COALESCE(ws.join_mode, 'approval_required') AS "joinMode",
            w.workspace_key AS "workspaceKey",
            w.default_project_id AS "defaultProjectId"
          FROM workspaces w
          LEFT JOIN workspace_settings ws ON ws.workspace_id = w.id
          WHERE w.id = $1
          LIMIT 1
        `,
        params: [workspaceId],
      } as never);

      res.json((result.rows as Array<Record<string, unknown>>)[0]);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update workspace settings.' });
    }
  });

  router.get('/workspaces/:workspaceId/members', async (req, res) => {
    try {
      const result = await db.execute({
        sql: `
          SELECT
            u.id,
            u.name,
            u.email,
            COALESCE(up.avatar_url, u.image, '') AS avatar,
            wm.role,
            wm.created_at AS "createdAt"
          FROM workspace_members wm
          JOIN "user" u ON u.id = wm.user_id
          LEFT JOIN user_profiles up ON up.user_id = u.id
          WHERE wm.workspace_id = $1
          ORDER BY wm.created_at ASC
        `,
        params: [req.params.workspaceId],
      } as never);
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load workspace members.' });
    }
  });

  router.get('/workspaces/:workspaceId/invites', async (req, res) => {
    try {
      const result = await db.execute({
        sql: `
          SELECT
            wi.id,
            wi.code,
            wi.label,
            wi.expires_at AS "expiresAt",
            wi.revoked_at AS "revokedAt",
            wi.max_uses AS "maxUses",
            wi.use_count AS "useCount",
            wi.created_at AS "createdAt",
            creator.name AS "createdByName",
            (
              SELECT COUNT(*)
              FROM workspace_join_requests requests
              WHERE requests.invite_id = wi.id AND requests.status = 'pending'
            ) AS "pendingJoinRequestCount"
          FROM workspace_invites wi
          JOIN "user" creator ON creator.id = wi.created_by
          WHERE wi.workspace_id = $1
          ORDER BY wi.created_at DESC
        `,
        params: [req.params.workspaceId],
      } as never);
      res.json(result.rows);
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
      await db.update(validations).set({ revokedAt }).where(eq(validations.id, invite.id));

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
      await ensureWorkspaceMembership(validation.workspaceId, guestUserId, 'member');
      await addUserToWorkspaceProjects(validation.workspaceId, guestUserId);

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
      const inviteRows = await db.execute({
        sql: `
          SELECT
            wi.id,
            wi.workspace_id AS "workspaceId",
            wi.revoked_at AS "revokedAt",
            wi.expires_at AS "expiresAt",
            wi.max_uses AS "maxUses",
            wi.use_count AS "useCount",
            COALESCE(ws.join_mode, 'approval_required') AS "joinMode"
          FROM workspace_invites wi
          LEFT JOIN workspace_settings ws ON ws.workspace_id = wi.workspace_id
          WHERE wi.code = $1
          LIMIT 1
        `,
        params: [inviteCode],
      } as never);
      const invite = (inviteRows.rows as Array<Record<string, unknown>>)[0];
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
      const result = await db.execute({
        sql: `
          SELECT
            request.id,
            request.requesting_user_id AS "requestingUserId",
            request.requester_name AS "requesterName",
            request.requester_email AS "requesterEmail",
            request.requester_avatar AS "requesterAvatar",
            request.message,
            request.status,
            request.reviewed_by AS "reviewedBy",
            reviewer.name AS "reviewedByName",
            request.reviewed_at AS "reviewedAt",
            request.created_at AS "createdAt"
          FROM workspace_join_requests request
          LEFT JOIN "user" reviewer ON reviewer.id = request.reviewed_by
          WHERE request.workspace_id = $1
          ORDER BY request.created_at DESC
        `,
        params: [req.params.workspaceId],
      } as never);
      res.json(result.rows);
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

  return router;
}