import { Router } from 'express';
import { broadcastEvent } from '../realtime.js';
import {
  FEDERATION_PUBLIC_KEY_HEADER,
  FEDERATION_SIGNATURE_HEADER,
  FEDERATION_TIMESTAMP_HEADER,
  decodeFederationPublicKey,
  isFederationTimestampFresh,
  verifyFederationRequestSignature,
} from '../lib/http-signatures.js';
import { getLocalNodeIdentity } from '../lib/node-identity.js';
import { resolveRequestActorUserId } from '../lib/request-auth.js';
import {
  acceptFederationHandshake,
  connectToFederatedWorkspace,
  createFederatedTicket,
  createFederationInvite,
  ensureWorkspaceAdminAccess,
  getWorkspaceById,
  listFederationOutboxEvents,
  listWorkspacePeers,
} from '../services/federation.js';
import { listTickets } from '../services/tickets.js';

export function createFederationRouter() {
  const router = Router();

  function resolveFederationSignature(req: Parameters<typeof verifyFederationRequestSignature>[0] extends never ? never : any) {
    const encodedPublicKey = req.header(FEDERATION_PUBLIC_KEY_HEADER)?.trim() || '';
    const signature = req.header(FEDERATION_SIGNATURE_HEADER)?.trim() || '';
    const timestamp = req.header(FEDERATION_TIMESTAMP_HEADER)?.trim() || '';

    if (!encodedPublicKey || !signature || !timestamp) {
      return null;
    }

    try {
      return {
        publicKey: decodeFederationPublicKey(encodedPublicKey),
        signature,
        timestamp,
      };
    } catch {
      return null;
    }
  }

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

  router.post('/federation/workspaces/:workspaceId/tickets', async (req, res) => {
    const { workspaceId } = req.params;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';

    if (!title || !projectId) {
      res.status(400).json({ error: 'title and projectId are required.' });
      return;
    }

    const signatureInput = resolveFederationSignature(req);
    if (!signatureInput) {
      res.status(401).json({ error: 'Federation signature headers are required.' });
      return;
    }

    if (!isFederationTimestampFresh(signatureInput.timestamp)) {
      res.status(401).json({ error: 'Federation signature timestamp is outside the accepted window.' });
      return;
    }

    const isValidSignature = verifyFederationRequestSignature({
      method: req.method,
      path: req.originalUrl,
      timestamp: signatureInput.timestamp,
      body: req.body ?? {},
      publicKey: signatureInput.publicKey,
      signature: signatureInput.signature,
    });
    if (!isValidSignature) {
      res.status(401).json({ error: 'Invalid federation signature.' });
      return;
    }

    try {
      const result = await createFederatedTicket({
        workspaceId,
        actorPublicKey: signatureInput.publicKey,
        ticket: {
          title,
          description: typeof req.body?.description === 'string' ? req.body.description : undefined,
          status: typeof req.body?.status === 'string' ? req.body.status : undefined,
          priority: typeof req.body?.priority === 'string' ? req.body.priority : undefined,
          projectId,
          domainId: typeof req.body?.domainId === 'string' ? req.body.domainId : undefined,
          cycleId: typeof req.body?.cycleId === 'string' ? req.body.cycleId : undefined,
          assigneeId: typeof req.body?.assigneeId === 'string' ? req.body.assigneeId : undefined,
          parentId: typeof req.body?.parentId === 'string' ? req.body.parentId : undefined,
        },
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      broadcastEvent('tickets-updated', { projectId, tickets: await listTickets(projectId) });
      res.status(201).json({
        ticket: result.ticket,
        outboxEventId: result.outboxEventId,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create federated ticket.' });
    }
  });

  router.get('/federation/workspaces/:workspaceId/outbox', async (req, res) => {
    const { workspaceId } = req.params;
    const signatureInput = resolveFederationSignature(req);
    if (!signatureInput) {
      res.status(401).json({ error: 'Federation signature headers are required.' });
      return;
    }

    if (!isFederationTimestampFresh(signatureInput.timestamp)) {
      res.status(401).json({ error: 'Federation signature timestamp is outside the accepted window.' });
      return;
    }

    const isValidSignature = verifyFederationRequestSignature({
      method: req.method,
      path: req.originalUrl,
      timestamp: signatureInput.timestamp,
      body: req.body ?? {},
      publicKey: signatureInput.publicKey,
      signature: signatureInput.signature,
    });
    if (!isValidSignature) {
      res.status(401).json({ error: 'Invalid federation signature.' });
      return;
    }

    try {
      const sinceEventIdRaw = Number(req.query.sinceEventId ?? req.query.since_event_id ?? 0);
      const limitRaw = Number(req.query.limit ?? 50);
      const result = await listFederationOutboxEvents({
        workspaceId,
        actorPublicKey: signatureInput.publicKey,
        sinceEventId: Number.isFinite(sinceEventIdRaw) ? sinceEventIdRaw : 0,
        limit: Number.isFinite(limitRaw) ? limitRaw : 50,
      });

      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json({
        events: result.events,
        lastEventId: result.lastEventId,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load federation outbox events.' });
    }
  });

  return router;
}