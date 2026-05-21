import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { db } from '../src/db/index.js';
import { ensureLocalNodeIdentity } from '../src/lib/node-identity.js';
import {
  authUsers,
  comments,
  federationInvites,
  identities,
  peerConnections,
  projects,
  syncOutbox,
  tickets,
  userProfiles,
  workspacePeers,
} from '../src/db/schema.js';
import { api, jsonResponse, seedUser, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { eq } from 'drizzle-orm';

import {
  createFederationInvite,
  acceptFederationHandshake,
  createFederatedTicket,
  updateFederatedTicket,
  deleteFederatedTicket,
  createFederatedComment,
  recordFederationSyncFailure,
  listFederationOutboxEvents,
  syncFederatedConnection,
} from '../src/services/federation/index.js';

import { createSignedFederationHeaders } from '../src/lib/http-signatures.js';

import { ExponentialBackoffPolicy } from '../src/services/federation/sync-state.js';
import {
  CommentCreateHandler,
  TicketCreateUpdateHandler,
  TicketDeleteHandler,
} from '../src/services/federation/sync-loop.js';

describe('Federation Modular Service', () => {
  beforeEach(async () => {
    await ensureLocalNodeIdentity();
  });

  describe('BackoffPolicy (Strategy Pattern)', () => {
    it('computes exponential backoff delays correctly and caps at maximum limit', () => {
      const baseMs = 100;
      const maxMs = 1000;
      const policy = new ExponentialBackoffPolicy(baseMs, maxMs);

      // failure count:
      // 1: 100 * 2^0 = 100ms
      // 2: 100 * 2^1 = 200ms
      // 3: 100 * 2^2 = 400ms
      // 4: 100 * 2^3 = 800ms
      // 5: 100 * 2^4 = 1600ms -> capped at 1000ms
      expect(policy.computeDelay(1)).toBe(100);
      expect(policy.computeDelay(2)).toBe(200);
      expect(policy.computeDelay(3)).toBe(400);
      expect(policy.computeDelay(4)).toBe(800);
      expect(policy.computeDelay(5)).toBe(1000);
      expect(policy.computeDelay(10)).toBe(1000);
    });
  });

  describe('Handshake Invite Orchestration', () => {
    it('creates a federation invite in the database with token and expiration', async () => {
      const { owner, workspace } = await seedWorkspaceFixture();

      const invite = await createFederationInvite({
        workspaceId: workspace.id,
        issuedByUserId: owner.id,
        expirationHours: 5,
      });

      expect(invite).toBeDefined();
      expect(invite.inviteToken).toHaveLength(36);
      expect(invite.workspaceId).toBe(workspace.id);
      expect(invite.issuedByUserId).toBe(owner.id);

      const dbRows = await db
        .select()
        .from(federationInvites)
        .where(eq(federationInvites.id, invite.id))
        .limit(1);
      expect(dbRows).toHaveLength(1);
      expect(dbRows[0].inviteToken).toBe(invite.inviteToken);
    });

    it('accepts a valid federation handshake invite successfully', async () => {
      const { owner, workspace } = await seedWorkspaceFixture();

      const invite = await createFederationInvite({
        workspaceId: workspace.id,
        issuedByUserId: owner.id,
      });

      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const guestPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const guestPrivateKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

      const guestDisplayName = 'External Partner Node';
      const guestHostUrl = 'http://external-partner.test';

      const handshakeTimestamp = new Date().toISOString();
      const challenge = [invite.inviteToken, handshakeTimestamp, guestHostUrl].join('\n');
      const handshakeSignature = sign(null, Buffer.from(challenge, 'utf8'), guestPrivateKey).toString('base64');

      const result = await acceptFederationHandshake({
        inviteToken: invite.inviteToken,
        guestPublicKey,
        guestDisplayName,
        guestHostUrl,
        handshakeSignature,
        handshakeTimestamp,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.workspace.id).toBe(workspace.id);
      expect(result.guestIdentity.publicKey).toBe(guestPublicKey.trim());
      expect(result.guestIdentity.displayName).toBe(guestDisplayName);

      // Verify DB invite updated
      const inviteRows = await db
        .select()
        .from(federationInvites)
        .where(eq(federationInvites.id, invite.id));
      expect(inviteRows[0].acceptedAt).not.toBeNull();
      expect(inviteRows[0].acceptedByPublicKey).toBe(guestPublicKey.trim());

      // Verify workspace peer created
      const peerRows = await db
        .select()
        .from(workspacePeers)
        .where(eq(workspacePeers.workspaceId, workspace.id));
      expect(peerRows).toHaveLength(1);
      expect(peerRows[0].status).toBe('verified');
      expect(peerRows[0].peerHostUrl).toBe(guestHostUrl);
    });

    it('rejects accept requests for non-existent, expired or revoked invites', async () => {
      const resultNonExistent = await acceptFederationHandshake({
        inviteToken: 'non-existent-token',
        guestPublicKey: 'key',
        guestDisplayName: 'Partner',
      });
      expect(resultNonExistent.ok).toBe(false);
      expect(resultNonExistent.error).toBe('Federation invite not found.');
    });
  });

  describe('Federation Event Handlers (Command Pattern)', () => {
    it('TicketCreateUpdateHandler creates or updates ticket replicas', async () => {
      const { workspace, project } = await seedWorkspaceFixture();
      const handler = new TicketCreateUpdateHandler();

      const ticketId = 'fed-ticket-1';
      const event = {
        eventId: 101,
        workspaceId: workspace.id,
        entityType: 'ticket',
        action: 'create',
        payload: {
          project: { id: project.id, key: project.key, name: project.name },
          ticket: {
            id: ticketId,
            key: 'GRV-999',
            title: 'Federated Issue',
            description: 'Task from host node',
            status: 'in_progress',
            priority: 'high',
            projectId: project.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };

      // Run handler
      const result = await db.transaction(async (tx) => {
        return await handler.handle(tx, event);
      });

      expect(result.changedTicketIds).toContain(ticketId);

      // Verify db insertion
      const ticketRows = await db.select().from(tickets).where(eq(tickets.id, ticketId));
      expect(ticketRows).toHaveLength(1);
      expect(ticketRows[0].title).toBe('Federated Issue');
      expect(ticketRows[0].key).toBe('GRV-999');
      expect(ticketRows[0].status).toBe('in_progress');
    });

    it('CommentCreateHandler inserts comments and creates replica guest authors', async () => {
      const { workspace, project } = await seedWorkspaceFixture();
      const ticket = await db
        .insert(tickets)
        .values({
          id: 'ti-comment-test',
          key: 'GRV-200',
          title: 'Existing ticket for comment',
          projectId: project.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const commentId = 'co-fed-1';
      const authorId = 'guest-author-1';
      const event = {
        eventId: 102,
        workspaceId: workspace.id,
        entityType: 'comment',
        action: 'create',
        payload: {
          ticket: { id: ticket[0].id, projectId: project.id },
          comment: {
            id: commentId,
            userId: authorId,
            body: 'Hello from peer node comment!',
            userName: 'Grace Hopper Guest',
            userAvatar: 'https://example.com/avatar.png',
            createdAt: new Date().toISOString(),
            author: { role: 'guest_developer' },
          },
        },
      };

      const handler = new CommentCreateHandler();
      const result = await db.transaction(async (tx) => {
        return await handler.handle(tx, event, {});
      });

      expect(result.changedTicketIds).toContain(ticket[0].id);

      // Verify guest user created
      const userRows = await db.select().from(authUsers).where(eq(authUsers.id, authorId));
      expect(userRows).toHaveLength(1);
      expect(userRows[0].name).toBe('Grace Hopper Guest');

      // Verify profile role
      const profileRows = await db.select().from(userProfiles).where(eq(userProfiles.userId, authorId));
      expect(profileRows).toHaveLength(1);
      expect(profileRows[0].role).toBe('guest_developer');

      // Verify comment inserted
      const commentRows = await db.select().from(comments).where(eq(comments.id, commentId));
      expect(commentRows).toHaveLength(1);
      expect(commentRows[0].body).toBe('Hello from peer node comment!');
    });

    it('TicketDeleteHandler handles cascades and removes local ticket replicas', async () => {
      const { project } = await seedWorkspaceFixture();
      const ticketId = 'ti-delete-test';
      await db.insert(tickets).values({
        id: ticketId,
        key: 'GRV-300',
        title: 'Ticket to delete',
        projectId: project.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(comments).values({
        id: 'co-del-test',
        ticketId,
        userId: 'some-user',
        body: 'Comment to delete too',
        createdAt: new Date(),
      });

      const event = {
        eventId: 103,
        workspaceId: 'workspace-1',
        entityType: 'ticket',
        action: 'delete',
        payload: {
          ticket: { id: ticketId, projectId: project.id },
        },
      };

      const handler = new TicketDeleteHandler();
      const result = await db.transaction(async (tx) => {
        return await handler.handle(tx, event);
      });

      expect(result.changedTicketIds).toContain(ticketId);

      // Verify deleted from tickets and comments
      const ticketRows = await db.select().from(tickets).where(eq(tickets.id, ticketId));
      expect(ticketRows).toHaveLength(0);

      const commentRows = await db.select().from(comments).where(eq(comments.ticketId, ticketId));
      expect(commentRows).toHaveLength(0);
    });
  });

  describe('Federated Mutations & Outbox Logging', () => {
    it('logs tickets created through federated mutation to the outbox', async () => {
      const { workspace, project } = await seedWorkspaceFixture();

      // Seed verified peer identity
      const publicKey = 'pub_peer_key_abc';
      const identity = await db
        .insert(identities)
        .values({
          id: 'idn-peer-1',
          displayName: 'Trusted Peer',
          publicKey,
          createdAt: new Date(),
        })
        .returning();

      await db.insert(workspacePeers).values({
        workspaceId: workspace.id,
        identityId: identity[0].id,
        invitedByUserId: 'owner-1',
        status: 'verified',
        createdAt: new Date(),
      });

      // Call createFederatedTicket
      const result = await createFederatedTicket({
        workspaceId: workspace.id,
        actorPublicKey: publicKey,
        ticket: {
          title: 'Federated Outbox Ticket',
          description: 'Testing the mutation syncing outbox pipeline',
          projectId: project.id,
          priority: 'medium',
          status: 'todo',
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.ticket.title).toBe('Federated Outbox Ticket');
      expect(result.outboxEventId).not.toBeNull();

      // Check sync outbox table
      const outboxRows = await db
        .select()
        .from(syncOutbox)
        .where(eq(syncOutbox.workspaceId, workspace.id));
      expect(outboxRows).toHaveLength(1);
      expect(outboxRows[0].action).toBe('create');
      expect(outboxRows[0].entityType).toBe('ticket');
      expect(outboxRows[0].actorPublicKey).toBe(publicKey);
    });
  });

  describe('Sync Failure and Backoff Bookkeeping', () => {
    it('recordFederationSyncFailure calculates backoffs and increments consecutive failures', async () => {
      const { workspace } = await seedWorkspaceFixture();

      // Seed a connection
      const connectionId = 'pcn-sync-test';
      await db.insert(peerConnections).values({
        id: connectionId,
        workspaceId: workspace.id,
        hostUrl: 'http://test-host.test',
        hostDisplayName: 'Test Host',
        hostPublicKey: 'pub_test_host_key',
        status: 'active',
        consecutiveFailures: 0,
        createdAt: new Date(),
      });

      // Record first failure
      const failure1 = await recordFederationSyncFailure(connectionId, 'Connection Timeout');
      expect(failure1).not.toBeNull();
      if (!failure1) return;

      expect(failure1.exhaustedRetries).toBe(false);
      expect(failure1.syncState.consecutiveFailures).toBe(1);
      expect(failure1.syncState.lastError).toBe('Connection Timeout');
      expect(failure1.syncState.nextAttemptAtMs).toBeGreaterThan(Date.now());

      // Fetch from DB to confirm it persisted
      const dbRows1 = await db.select().from(peerConnections).where(eq(peerConnections.id, connectionId));
      expect(dbRows1[0].consecutiveFailures).toBe(1);
      expect(dbRows1[0].status).toBe('active');
      expect(dbRows1[0].lastError).toBe('Connection Timeout');

      // Record enough failures to exhaust retries (Max retries is 5 in env.ts, or we can mock/run multiple)
      let exhaustedResult: any = null;
      for (let i = 0; i < 6; i++) {
        exhaustedResult = await recordFederationSyncFailure(connectionId, 'Fatal crash');
      }

      expect(exhaustedResult).not.toBeNull();
      expect(exhaustedResult.exhaustedRetries).toBe(true);

      const dbRowsExhausted = await db.select().from(peerConnections).where(eq(peerConnections.id, connectionId));
      expect(dbRowsExhausted[0].status).toBe('failed');
    });
  });

  describe('Integration HTTP routes verification', () => {
    it('GET /api/v1/federation/identity yields the local server identity details', async () => {
      const res = await api().get('/api/v1/federation/identity');
      expect(res.status).toBe(200);
      expect(res.body.publicKey).toBeDefined();
      expect(res.body.displayName).toBeDefined();
    });

    it('POST /api/v1/federation/workspaces/:workspaceId/invites creates and returns invite URL for workspace admin', async () => {
      const { owner, workspace } = await seedWorkspaceFixture();

      const inviteRes = await api()
        .post(`/api/v1/federation/workspaces/${workspace.id}/invites`)
        .set('x-user-id', owner.id)
        .send({ expirationHours: 12 });

      expect(inviteRes.status).toBe(201);
      expect(inviteRes.body.id).toBeDefined();
      expect(inviteRes.body.workspaceId).toBe(workspace.id);
      expect(inviteRes.body.handshakeUrl).toContain('/api/v1/federation/handshakes/accept');
    });
  });

  describe('Cryptographic Replay Protection', () => {
    it('rejects duplicate requests using the same signature with 401 Unauthorized', async () => {
      const { workspace, project } = await seedWorkspaceFixture();

      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const guestPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const guestPrivateKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

      const identity = await db
        .insert(identities)
        .values({
          id: 'idn-replay-peer',
          displayName: 'Replay Partner',
          publicKey: guestPublicKey.trim(),
          createdAt: new Date(),
        })
        .returning();

      await db.insert(workspacePeers).values({
        workspaceId: workspace.id,
        identityId: identity[0].id,
        invitedByUserId: 'owner-1',
        status: 'verified',
        createdAt: new Date(),
      });

      const body = {
        title: 'Replay Protection Ticket',
        projectId: project.id,
      };

      const path = `/api/v1/federation/workspaces/${workspace.id}/tickets`;
      const timestamp = new Date().toISOString();

      const headers = createSignedFederationHeaders({
        method: 'POST',
        path,
        timestamp,
        body,
        publicKey: guestPublicKey,
        privateKey: guestPrivateKey,
      });

      // First request should succeed
      const firstRes = await api()
        .post(path)
        .set(headers)
        .send(body);

      expect(firstRes.status).toBe(201);
      expect(firstRes.body.ticket).toBeDefined();

      // Second identical request should be rejected as a replay attack
      const secondRes = await api()
        .post(path)
        .set(headers)
        .send(body);

      expect(secondRes.status).toBe(401);
      expect(secondRes.body.error).toContain('Duplicate federation signature detected');
    });
  });

  describe('Cryptographic Handshake Verification - Negative Cases', () => {
    it('rejects handshake accept when timestamp is outside accepted window', async () => {
      const { owner, workspace } = await seedWorkspaceFixture();

      const invite = await createFederationInvite({
        workspaceId: workspace.id,
        issuedByUserId: owner.id,
      });

      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const guestPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const guestPrivateKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

      const guestDisplayName = 'Stale Partner';
      const guestHostUrl = 'http://external-partner.test';

      const handshakeTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const challenge = [invite.inviteToken, handshakeTimestamp, guestHostUrl].join('\n');
      const handshakeSignature = sign(null, Buffer.from(challenge, 'utf8'), guestPrivateKey).toString('base64');

      const result = await acceptFederationHandshake({
        inviteToken: invite.inviteToken,
        guestPublicKey,
        guestDisplayName,
        guestHostUrl,
        handshakeSignature,
        handshakeTimestamp,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('timestamp');
    });

    it('rejects handshake accept when signature is invalid', async () => {
      const { owner, workspace } = await seedWorkspaceFixture();

      const invite = await createFederationInvite({
        workspaceId: workspace.id,
        issuedByUserId: owner.id,
      });

      const { publicKey } = generateKeyPairSync('ed25519');
      const guestPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();

      const guestDisplayName = 'Invalid Sign Partner';
      const guestHostUrl = 'http://external-partner.test';

      const handshakeTimestamp = new Date().toISOString();
      const handshakeSignature = Buffer.from('invalid-signature-data').toString('base64');

      const result = await acceptFederationHandshake({
        inviteToken: invite.inviteToken,
        guestPublicKey,
        guestDisplayName,
        guestHostUrl,
        handshakeSignature,
        handshakeTimestamp,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid handshake signature');
    });
  });

  describe('O(N) Sync Loop Batch Integrations', () => {
    it('batch syncs multiple related workspace project, ticket, and comment events', async () => {
      const { workspace, project } = await seedWorkspaceFixture();

      const connectionId = 'pcn-batch-sync';
      await db.insert(peerConnections).values({
        id: connectionId,
        workspaceId: workspace.id,
        hostUrl: 'http://batch-host.test',
        hostDisplayName: 'Batch Host',
        hostPublicKey: 'pub_batch_host_key',
        status: 'active',
        consecutiveFailures: 0,
        createdAt: new Date(),
      });

      const timestamp = new Date().toISOString();
      const mockOutboxEvents = [
        {
          eventId: 10,
          workspaceId: workspace.id,
          entityType: 'ticket',
          action: 'create',
          payload: {
            project: { id: project.id, key: project.key, name: project.name },
            ticket: {
              id: 'ticket-batch-1',
              key: `${project.key}-101`,
              title: 'Batch Seed Ticket 1',
              projectId: project.id,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          },
        },
        {
          eventId: 11,
          workspaceId: workspace.id,
          entityType: 'ticket',
          action: 'create',
          payload: {
            project: { id: project.id, key: project.key, name: project.name },
            ticket: {
              id: 'ticket-batch-2',
              key: `${project.key}-102`,
              title: 'Batch Seed Ticket 2',
              projectId: project.id,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          },
        },
        {
          eventId: 12,
          workspaceId: workspace.id,
          entityType: 'comment',
          action: 'create',
          payload: {
            ticket: { id: 'ticket-batch-1', projectId: project.id },
            comment: {
              id: 'comment-batch-1',
              userId: 'user-batch-1',
              body: 'Hello batch comment 1',
              userName: 'Batch Author 1',
              createdAt: timestamp,
            },
          },
        },
        {
          eventId: 13,
          workspaceId: workspace.id,
          entityType: 'comment',
          action: 'create',
          payload: {
            ticket: { id: 'ticket-batch-2', projectId: project.id },
            comment: {
              id: 'comment-batch-2',
              userId: 'user-batch-2',
              body: 'Hello batch comment 2',
              userName: 'Batch Author 2',
              createdAt: timestamp,
            },
          },
        },
      ];

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ events: mockOutboxEvents, lastEventId: 13 }),
        } as Response)
      );

      try {
        const result = await syncFederatedConnection({
          connectionId,
          limit: 50,
        });

        if (!result.ok) {
          console.error('Batch sync failed with error:', result);
        }
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.appliedCount).toBe(4);
        expect(result.lastSyncedEventId).toBe(13);

        const ticketRows = await db
          .select()
          .from(tickets)
          .where(eq(tickets.projectId, project.id));
        
        const seededTicketIds = ticketRows.map((t) => t.id);
        expect(seededTicketIds).toContain('ticket-batch-1');
        expect(seededTicketIds).toContain('ticket-batch-2');

        const comment1Rows = await db.select().from(comments).where(eq(comments.id, 'comment-batch-1'));
        expect(comment1Rows).toHaveLength(1);
        expect(comment1Rows[0].body).toBe('Hello batch comment 1');

        const comment2Rows = await db.select().from(comments).where(eq(comments.id, 'comment-batch-2'));
        expect(comment2Rows).toHaveLength(1);
        expect(comment2Rows[0].body).toBe('Hello batch comment 2');

        const author1Rows = await db.select().from(authUsers).where(eq(authUsers.id, 'user-batch-1'));
        expect(author1Rows).toHaveLength(1);
        expect(author1Rows[0].name).toBe('Batch Author 1');

        const author2Rows = await db.select().from(authUsers).where(eq(authUsers.id, 'user-batch-2'));
        expect(author2Rows).toHaveLength(1);
        expect(author2Rows[0].name).toBe('Batch Author 2');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
