import { and, desc, eq, or } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.js';
import { userSettings, authUsers, mcpConnectionTokens, mcpOAuthClients, mcpOAuthGrants, workspaces, workspaceMembers } from '../../db/schema.js';
import { broadcastEvent } from '../../realtime.js';
import { ensureUserDefaults, getUserById, listUsers } from '../../lib/platform.js';
import { audit } from '../../lib/logger.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { authorizeProjectAccess, authorizeTeamAccess, authorizeWorkspaceAccess } from '../workspaces/services/membership.js';

export function createUsersRouter() {
  const router = Router();

  // Account settings show only this user's credentials, even in workspaces
  // where they can administer other users' credentials. Read membership fresh.
  router.get('/users/me/mcp/connections', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const rows = await db.select({
        id: mcpConnectionTokens.id,
        generatedBy: mcpConnectionTokens.generatedBy,
        scopes: mcpConnectionTokens.scopes,
        singleUse: mcpConnectionTokens.singleUse,
        status: mcpConnectionTokens.status,
        connectionType: mcpConnectionTokens.connectionType,
        clientMetadata: mcpOAuthClients.metadata,
        createdAt: mcpConnectionTokens.createdAt,
        expiresAt: mcpConnectionTokens.expiresAt,
        usedAt: mcpConnectionTokens.usedAt,
        revokedAt: mcpConnectionTokens.revokedAt,
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        workspaceKey: workspaces.key,
        workspaceOwnerId: workspaces.createdBy,
        membershipRole: workspaceMembers.role,
      }).from(mcpConnectionTokens)
        .innerJoin(workspaces, eq(workspaces.id, mcpConnectionTokens.workspaceId))
        .leftJoin(mcpOAuthGrants, eq(mcpOAuthGrants.connectionId, mcpConnectionTokens.id))
        .leftJoin(mcpOAuthClients, eq(mcpOAuthClients.id, mcpOAuthGrants.clientId))
        .leftJoin(workspaceMembers, and(
          eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, actorUserId),
        ))
        .where(and(
          eq(mcpConnectionTokens.generatedBy, actorUserId),
          or(eq(workspaces.createdBy, actorUserId), eq(workspaceMembers.userId, actorUserId)),
        ))
        .orderBy(desc(mcpConnectionTokens.createdAt), desc(mcpConnectionTokens.id));

      res.json(rows.map(({ workspaceOwnerId, membershipRole, clientMetadata, ...connection }) => ({
        ...connection,
        clientName: clientMetadata?.client_name ?? null,
        workspaceRole: workspaceOwnerId === actorUserId ? 'owner' : membershipRole,
        createdAt: connection.createdAt?.toISOString() ?? null,
        expiresAt: connection.expiresAt?.toISOString() ?? null,
        usedAt: connection.usedAt?.toISOString() ?? null,
        revokedAt: connection.revokedAt?.toISOString() ?? null,
      })));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list your connection tokens.' });
    }
  });

  router.get('/users', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
      const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;

      const actorUserId = await resolveRequestActorUserId(req);

      if (projectId) {
        const auth = await authorizeProjectAccess(req, projectId);
        if (!auth.allowed) {
          audit('users.list.scope_rejected', {
            action: 'list_users',
            actorUserId,
            requestedScope: { projectId },
            status: auth.status,
            error: auth.error,
            route: 'GET /users',
          });
          res.status(auth.status).json({ error: auth.error });
          return;
        }
      } else if (teamId) {
        const auth = await authorizeTeamAccess(req, teamId);
        if (!auth.allowed) {
          audit('users.list.scope_rejected', {
            action: 'list_users',
            actorUserId,
            requestedScope: { teamId },
            status: auth.status,
            error: auth.error,
            route: 'GET /users',
          });
          res.status(auth.status).json({ error: auth.error });
          return;
        }
      } else if (workspaceId) {
        const auth = await authorizeWorkspaceAccess(req, workspaceId);
        if (!auth.allowed) {
          audit('users.list.scope_rejected', {
            action: 'list_users',
            actorUserId,
            requestedScope: { workspaceId },
            status: auth.status,
            error: auth.error,
            route: 'GET /users',
          });
          res.status(auth.status).json({ error: auth.error });
          return;
        }
      } else {
        audit('users.list.scope_missing', {
          action: 'list_users',
          actorUserId,
          route: 'GET /users',
        });
        res.status(400).json({ error: 'workspaceId, projectId, or teamId is required to list users.' });
        return;
      }

      const users = await listUsers(projectId
        ? { projectId }
        : teamId
          ? { teamId }
          : { workspaceId }
      );
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load users.' });
    }
  });

  router.patch('/users/:userId/tutorial', async (req, res) => {
    const { userId } = req.params;
    const completed = Boolean(req.body?.completed);

    try {
      await ensureUserDefaults(userId);
      await db
        .update(userSettings)
        .set({ tutorialCompleted: completed, updatedAt: new Date() })
        .where(eq(userSettings.userId, userId));

      await db
        .update(authUsers)
        .set({ tutorial_completed: completed, updatedAt: new Date() })
        .where(eq(authUsers.id, userId));

      const user = await getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      broadcastEvent('users-updated', { userId });
      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update tutorial state.' });
    }
  });

  return router;
}
