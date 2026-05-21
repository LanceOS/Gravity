import { Router } from 'express';
import { getLocalNodeIdentity } from '../lib/node-identity.js';
import { resolveRequestActorUserId } from '../lib/request-auth.js';
import {
  acceptFederationHandshake,
  connectToFederatedWorkspace,
  createFederationInvite,
  ensureWorkspaceAdminAccess,
  getWorkspaceById,
  listWorkspacePeers,
} from '../services/federation.js';

export function createFederationRouter() {
  const router = Router();

  router.get('/federation/identity', async (_req, res) => {
    try {
      const identity = await getLocalNodeIdentity();
      if (!identity) {
        res.status(503).json({ error: 'Local node identity has not been initialized yet.' });
        return;
      }

      res.json({
        id: identity.id,
        displayName: identity.displayName,
        publicKey: identity.publicKey,
        algorithm: 'Ed25519',
        createdAt: identity.createdAt,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load local node identity.' });
    }
  });

  router.post('/federation/workspaces/:workspaceId/invites', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { workspaceId } = req.params;
    const hasAccess = await ensureWorkspaceAdminAccess(workspaceId, actorUserId);
    if (!hasAccess) {
      res.status(403).json({ error: 'Owner or admin access is required.' });
      return;
    }

    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    try {
      const expirationHoursRaw = Number(req.body?.expirationHours ?? req.body?.expiration_hours ?? 24);
      const invite = await createFederationInvite({
        workspaceId,
        issuedByUserId: actorUserId,
        expirationHours: Number.isFinite(expirationHoursRaw) ? expirationHoursRaw : 24,
      });

      const baseUrl = workspace.hostUrl?.trim() || `${req.protocol}://${req.get('host') ?? 'localhost'}`;
      res.status(201).json({
        id: invite.id,
        workspaceId: invite.workspaceId,
        inviteToken: invite.inviteToken,
        expiresAt: invite.expiresAt,
        handshakeUrl: `${baseUrl.replace(/\/$/, '')}/api/v1/federation/handshakes/accept`,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create federation invite.' });
    }
  });

  router.get('/federation/workspaces/:workspaceId/peers', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { workspaceId } = req.params;
    const hasAccess = await ensureWorkspaceAdminAccess(workspaceId, actorUserId);
    if (!hasAccess) {
      res.status(403).json({ error: 'Owner or admin access is required.' });
      return;
    }

    try {
      const peers = await listWorkspacePeers(workspaceId);
      res.json(
        peers.map((peer) => ({
          workspaceId: peer.workspaceId,
          identityId: peer.identityId,
          displayName: peer.displayName,
          publicKey: peer.publicKey,
          peerHostUrl: peer.peerHostUrl,
          status: peer.status,
          createdAt: peer.createdAt,
        })),
      );
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load workspace peers.' });
    }
  });

  router.post('/federation/handshakes/accept', async (req, res) => {
    const inviteToken = typeof req.body?.inviteToken === 'string' ? req.body.inviteToken.trim() : '';
    const guestPublicKey = typeof req.body?.guestPublicKey === 'string' ? req.body.guestPublicKey.trim() : '';
    const guestDisplayName = typeof req.body?.guestDisplayName === 'string' ? req.body.guestDisplayName.trim() : '';
    const guestHostUrl = typeof req.body?.guestHostUrl === 'string' ? req.body.guestHostUrl.trim() : '';

    if (!inviteToken || !guestPublicKey || !guestDisplayName) {
      res.status(400).json({ error: 'inviteToken, guestPublicKey, and guestDisplayName are required.' });
      return;
    }

    try {
      const result = await acceptFederationHandshake({
        inviteToken,
        guestPublicKey,
        guestDisplayName,
        guestHostUrl,
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json({
        accepted: true,
        workspaceId: result.workspace.id,
        workspaceName: result.workspace.name,
        hostPublicKey: result.localNodeIdentity.publicKey,
        hostDisplayName: result.localNodeIdentity.displayName,
        hostUrl: result.workspace.hostUrl || '',
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to accept federation handshake.' });
    }
  });

  router.post('/federation/handshakes/connect', async (req, res) => {
    const hostUrl = typeof req.body?.hostUrl === 'string' ? req.body.hostUrl.trim() : '';
    const inviteToken = typeof req.body?.inviteToken === 'string' ? req.body.inviteToken.trim() : '';

    if (!hostUrl || !inviteToken) {
      res.status(400).json({ error: 'hostUrl and inviteToken are required.' });
      return;
    }

    try {
      const result = await connectToFederatedWorkspace({ hostUrl, inviteToken });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json({
        connection: {
          id: result.connection.id,
          workspaceId: result.connection.workspaceId,
          hostUrl: result.connection.hostUrl,
          hostDisplayName: result.connection.hostDisplayName,
          hostPublicKey: result.connection.hostPublicKey,
          status: result.connection.status,
          lastSyncedEventId: result.connection.lastSyncedEventId,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to connect to federated workspace.' });
    }
  });

  return router;
}