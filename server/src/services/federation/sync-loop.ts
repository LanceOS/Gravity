import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  authUsers,
  comments,
  peerConnections,
  projects,
  syncOutbox,
  tickets,
  userProfiles,
} from '../../db/schema.js';
import { env } from '../../env.js';
import { decryptNodePrivateKey } from '../../lib/crypto.js';
import { createSignedFederationHeaders } from '../../lib/http-signatures.js';
import { ensureLocalNodeIdentity } from '../../lib/node-identity.js';
import { normalizeIsoDate } from '../../lib/platform.js';
import { getVerifiedWorkspacePeerByPublicKey } from './db-helpers.js';
import {
  federationSyncStates,
  getFederationSyncState,
  persistFederationSyncState,
  recordFederationSyncFailure,
} from './sync-state.js';
import {
  asNullableString,
  asString,
  createFederatedAuthorAvatar,
  createFederatedAuthorEmail,
  isRecord,
  parseFederationDate,
} from './utils.js';

// Command Pattern for federation incoming events handling
export interface FederationEventHandler {
  canHandle(entityType: string, action: string): boolean;
  handle(
    tx: any,
    event: {
      eventId: number;
      workspaceId: string;
      entityType: string;
      action: string;
      payload: Record<string, any>;
    },
    connection: any
  ): Promise<{ changedProjectIds: string[]; changedTicketIds: string[] }>;
}

export class CommentCreateHandler implements FederationEventHandler {
  canHandle(entityType: string, action: string): boolean {
    return entityType === 'comment' && action === 'create';
  }

  async handle(
    tx: any,
    event: {
      eventId: number;
      workspaceId: string;
      entityType: string;
      action: string;
      payload: Record<string, any>;
    },
    connection: any
  ): Promise<{ changedProjectIds: string[]; changedTicketIds: string[] }> {
    const { eventId, payload } = event;
    const ticketPayload = isRecord(payload.ticket) ? payload.ticket : null;
    if (!ticketPayload) {
      throw new Error(`Federation comment event ${eventId} is missing ticket data.`);
    }

    const ticketId = asString(ticketPayload.id);
    const projectId = asString(ticketPayload.projectId);

    if (!ticketId || !projectId) {
      throw new Error(`Federation ticket event ${eventId} is missing required ticket fields.`);
    }

    const localTicketRows = await tx
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)))
      .limit(1);
    if (!localTicketRows[0]) {
      throw new Error(`Missing local ticket replica ${ticketId} for federation comment event ${eventId}.`);
    }

    const commentPayload = isRecord(payload.comment) ? payload.comment : null;
    if (!commentPayload) {
      throw new Error(`Federation comment event ${eventId} is missing comment data.`);
    }

    const commentId = asString(commentPayload.id);
    const commentUserId = asString(commentPayload.userId);
    const commentBody = asString(commentPayload.body);
    const commentUserName = asString(commentPayload.userName, 'Federated Peer');
    const commentUserAvatar = asString(commentPayload.userAvatar, createFederatedAuthorAvatar(commentUserId || commentId));
    const commentAuthor = isRecord(commentPayload.author) ? commentPayload.author : null;

    if (!commentId || !commentUserId || !commentBody) {
      throw new Error(`Federation comment event ${eventId} is missing required comment fields.`);
    }

    await tx
      .insert(authUsers)
      .values({
        id: commentUserId,
        name: commentUserName,
        email: createFederatedAuthorEmail(commentUserId),
        emailVerified: false,
        image: commentUserAvatar,
        createdAt: parseFederationDate(commentPayload.createdAt),
        updatedAt: parseFederationDate(commentPayload.createdAt),
      })
      .onConflictDoUpdate({
        target: authUsers.id,
        set: {
          name: commentUserName,
          image: commentUserAvatar,
          updatedAt: new Date(),
        },
      });

    await tx
      .insert(userProfiles)
      .values({
        userId: commentUserId,
        role: asString(commentAuthor?.role, 'guest_contributor'),
        avatarUrl: commentUserAvatar,
        createdAt: parseFederationDate(commentPayload.createdAt),
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          role: asString(commentAuthor?.role, 'guest_contributor'),
          avatarUrl: commentUserAvatar,
        },
      });

    await tx
      .insert(comments)
      .values({
        id: commentId,
        ticketId,
        userId: commentUserId,
        body: commentBody,
        createdAt: parseFederationDate(commentPayload.createdAt),
      })
      .onConflictDoNothing({ target: comments.id });

    return {
      changedProjectIds: [projectId],
      changedTicketIds: [ticketId],
    };
  }
}

export class TicketDeleteHandler implements FederationEventHandler {
  canHandle(entityType: string, action: string): boolean {
    return entityType === 'ticket' && action === 'delete';
  }

  async handle(
    tx: any,
    event: {
      eventId: number;
      workspaceId: string;
      entityType: string;
      action: string;
      payload: Record<string, any>;
    }
  ): Promise<{ changedProjectIds: string[]; changedTicketIds: string[] }> {
    const { eventId, payload } = event;
    const ticketPayload = isRecord(payload.ticket) ? payload.ticket : null;
    if (!ticketPayload) {
      throw new Error(`Federation ticket event ${eventId} is missing ticket data.`);
    }

    const ticketId = asString(ticketPayload.id);
    const projectId = asString(ticketPayload.projectId);

    if (!ticketId || !projectId) {
      throw new Error(`Federation ticket event ${eventId} is missing required ticket fields.`);
    }

    await tx.delete(comments).where(eq(comments.ticketId, ticketId));
    await tx.delete(tickets).where(eq(tickets.parentId, ticketId));
    await tx.delete(tickets).where(eq(tickets.id, ticketId));

    return {
      changedProjectIds: [projectId],
      changedTicketIds: [ticketId],
    };
  }
}

export class TicketCreateUpdateHandler implements FederationEventHandler {
  canHandle(entityType: string, action: string): boolean {
    return entityType === 'ticket' && (action === 'create' || action === 'update');
  }

  async handle(
    tx: any,
    event: {
      eventId: number;
      workspaceId: string;
      entityType: string;
      action: string;
      payload: Record<string, any>;
    }
  ): Promise<{ changedProjectIds: string[]; changedTicketIds: string[] }> {
    const { eventId, payload } = event;
    const ticketPayload = isRecord(payload.ticket) ? payload.ticket : null;
    if (!ticketPayload) {
      throw new Error(`Federation ticket event ${eventId} is missing ticket data.`);
    }

    const ticketId = asString(ticketPayload.id);
    const projectId = asString(ticketPayload.projectId);

    if (!ticketId || !projectId) {
      throw new Error(`Federation ticket event ${eventId} is missing required ticket fields.`);
    }

    const ticketKey = asString(ticketPayload.key);
    const ticketTitle = asString(ticketPayload.title);

    if (!ticketKey || !ticketTitle) {
      throw new Error(`Federation ticket event ${eventId} is missing required ticket fields.`);
    }

    await tx
      .insert(tickets)
      .values({
        id: ticketId,
        key: ticketKey,
        title: ticketTitle,
        description: asString(ticketPayload.description),
        status: asString(ticketPayload.status, 'todo'),
        priority: asString(ticketPayload.priority, 'no_priority'),
        assigneeId: asNullableString(ticketPayload.assigneeId) ?? null,
        projectId,
        domainId: asNullableString(ticketPayload.domainId) ?? null,
        cycleId: asNullableString(ticketPayload.cycleId) ?? null,
        parentId: asNullableString(ticketPayload.parentId) ?? null,
        prStatus: asString(ticketPayload.prStatus, 'none'),
        prUrl: asNullableString(ticketPayload.prUrl) ?? null,
        createdAt: parseFederationDate(ticketPayload.createdAt),
        updatedAt: parseFederationDate(ticketPayload.updatedAt),
      })
      .onConflictDoUpdate({
        target: tickets.id,
        set: {
          key: ticketKey,
          title: ticketTitle,
          description: asString(ticketPayload.description),
          status: asString(ticketPayload.status, 'todo'),
          priority: asString(ticketPayload.priority, 'no_priority'),
          assigneeId: asNullableString(ticketPayload.assigneeId) ?? null,
          projectId,
          domainId: asNullableString(ticketPayload.domainId) ?? null,
          cycleId: asNullableString(ticketPayload.cycleId) ?? null,
          parentId: asNullableString(ticketPayload.parentId) ?? null,
          prStatus: asString(ticketPayload.prStatus, 'none'),
          prUrl: asNullableString(ticketPayload.prUrl) ?? null,
          updatedAt: parseFederationDate(ticketPayload.updatedAt),
        },
      });

    return {
      changedProjectIds: [projectId],
      changedTicketIds: [ticketId],
    };
  }
}

const eventHandlers: FederationEventHandler[] = [
  new CommentCreateHandler(),
  new TicketDeleteHandler(),
  new TicketCreateUpdateHandler(),
];

let federationSyncTimer: NodeJS.Timeout | null = null;
const inFlightFederationSyncs = new Set<string>();

export async function listFederationOutboxEvents(input: {
  workspaceId: string;
  actorPublicKey: string;
  sinceEventId?: number;
  limit?: number;
}) {
  const verifiedPeer = await getVerifiedWorkspacePeerByPublicKey(input.workspaceId, input.actorPublicKey);
  if (!verifiedPeer) {
    return { ok: false as const, status: 403, error: 'Peer is not verified for this workspace.' };
  }

  const sinceEventId = Number.isFinite(input.sinceEventId) ? Math.max(0, input.sinceEventId ?? 0) : 0;
  const limit = Number.isFinite(input.limit) ? Math.min(Math.max(1, input.limit ?? 50), 100) : 50;

  const rows = await db
    .select({
      eventId: syncOutbox.eventId,
      workspaceId: syncOutbox.workspaceId,
      actorPublicKey: syncOutbox.actorPublicKey,
      entityType: syncOutbox.entityType,
      entityId: syncOutbox.entityId,
      action: syncOutbox.action,
      payload: syncOutbox.payload,
      createdAt: syncOutbox.createdAt,
    })
    .from(syncOutbox)
    .where(and(eq(syncOutbox.workspaceId, input.workspaceId), gt(syncOutbox.eventId, sinceEventId)))
    .orderBy(asc(syncOutbox.eventId))
    .limit(limit);

  const events = rows.map((row) => ({
    eventId: row.eventId,
    workspaceId: row.workspaceId,
    actorPublicKey: row.actorPublicKey,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    payload: row.payload,
    createdAt: normalizeIsoDate(row.createdAt),
  }));

  return {
    ok: true as const,
    events,
    lastEventId: events.at(-1)?.eventId ?? sinceEventId,
  };
}

export async function syncFederatedConnection(input: {
  connectionId: string;
  limit?: number;
}) {
  const connectionRows = await db.select().from(peerConnections).where(eq(peerConnections.id, input.connectionId)).limit(1);
  const connection = connectionRows[0];
  if (!connection) {
    return { ok: false as const, status: 404, error: 'Federation connection not found.' };
  }
  const attemptStartedAt = new Date();

  const localNodeIdentity = await ensureLocalNodeIdentity();
  const privateKey = decryptNodePrivateKey(localNodeIdentity.encryptedPrivateKey);
  if (!privateKey) {
    return { ok: false as const, status: 500, error: 'Local node private key is unavailable.' };
  }

  const limit = Number.isFinite(input.limit) ? Math.min(Math.max(1, input.limit ?? 50), 100) : 50;
  const outboxPath = `/api/v1/federation/workspaces/${connection.workspaceId}/outbox?sinceEventId=${connection.lastSyncedEventId}&limit=${limit}`;
  const timestamp = new Date().toISOString();

  let response: Response;
  try {
    response = await fetch(`${connection.hostUrl}${outboxPath}`, {
      method: 'GET',
      headers: createSignedFederationHeaders({
        publicKey: localNodeIdentity.publicKey,
        privateKey,
        method: 'GET',
        path: outboxPath,
        timestamp,
        body: {},
      }),
    });
  } catch (error) {
    return {
      ok: false as const,
      status: 502,
      error: error instanceof Error ? error.message : 'Failed to reach the host node.',
    };
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      error: typeof data.error === 'string' ? data.error : 'Failed to fetch federation outbox events.',
    };
  }

  const rawEvents = Array.isArray(data.events) ? data.events : [];

  try {
    const result = await db.transaction(async (tx) => {
      const changedProjectIds = new Set<string>();
      const changedTicketIds = new Set<string>();
      let lastAppliedEventId = connection.lastSyncedEventId;

      for (const rawEvent of rawEvents) {
        if (!isRecord(rawEvent)) {
          throw new Error('Received a malformed federation event payload.');
        }

        const eventId = Number(rawEvent.eventId ?? 0);
        const workspaceId = asString(rawEvent.workspaceId);
        const entityType = asString(rawEvent.entityType);
        const action = asString(rawEvent.action);
        const payload = isRecord(rawEvent.payload) ? rawEvent.payload : null;

        if (!Number.isFinite(eventId) || eventId <= 0) {
          throw new Error('Received a federation event without a valid eventId.');
        }
        if (workspaceId !== connection.workspaceId) {
          throw new Error(`Received a federation event for unexpected workspace ${workspaceId}.`);
        }
        if (
          (entityType === 'ticket' && action !== 'create' && action !== 'update' && action !== 'delete') ||
          (entityType === 'comment' && action !== 'create') ||
          (entityType !== 'ticket' && entityType !== 'comment')
        ) {
          throw new Error(`Unsupported federation event ${entityType}:${action}.`);
        }
        if (!payload) {
          throw new Error(`Federation event ${eventId} is missing a payload.`);
        }

        // Apply Project replica upsert if present in payload
        const projectPayload = isRecord(payload.project) ? payload.project : null;
        if (projectPayload) {
          const projectId = asString(projectPayload.id);
          if (projectId) {
            await tx
              .insert(projects)
              .values({
                id: projectId,
                workspaceId: asString(projectPayload.workspaceId, connection.workspaceId),
                name: asString(projectPayload.name, 'Federated Project'),
                description: asString(projectPayload.description),
                key: asString(projectPayload.key),
                status: asString(projectPayload.status, 'active'),
                inviteCode: asString(projectPayload.inviteCode, `fed-${projectId}`),
                createdBy: asString(projectPayload.createdBy, 'federated-host'),
                createdAt: parseFederationDate(projectPayload.createdAt),
                updatedAt: parseFederationDate(projectPayload.updatedAt),
              })
              .onConflictDoUpdate({
                target: projects.id,
                set: {
                  workspaceId: asString(projectPayload.workspaceId, connection.workspaceId),
                  name: asString(projectPayload.name, 'Federated Project'),
                  description: asString(projectPayload.description),
                  key: asString(projectPayload.key),
                  status: asString(projectPayload.status, 'active'),
                  inviteCode: asString(projectPayload.inviteCode, `fed-${projectId}`),
                  createdBy: asString(projectPayload.createdBy, 'federated-host'),
                  updatedAt: parseFederationDate(projectPayload.updatedAt),
                },
              });
          }
        }

        const ticketPayload = isRecord(payload.ticket) ? payload.ticket : null;
        if (!ticketPayload) {
          throw new Error(`Federation ${entityType} event ${eventId} is missing ticket data.`);
        }

        const ticketId = asString(ticketPayload.id);
        const projectId = asString(ticketPayload.projectId);

        if (!ticketId || !projectId) {
          throw new Error(`Federation ticket event ${eventId} is missing required ticket fields.`);
        }

        const localProjectRows = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.workspaceId, connection.workspaceId)))
          .limit(1);
        if (!localProjectRows[0]) {
          throw new Error(`Missing local project replica ${projectId} for federation event ${eventId}.`);
        }

        // Apply concrete Event Handler (Command Pattern)
        const handler = eventHandlers.find((h) => h.canHandle(entityType, action));
        if (!handler) {
          throw new Error(`Unsupported federation event ${entityType}:${action}.`);
        }

        const handlerResult = await handler.handle(
          tx,
          { eventId, workspaceId, entityType, action, payload },
          connection
        );

        for (const pId of handlerResult.changedProjectIds) {
          changedProjectIds.add(pId);
        }
        for (const tId of handlerResult.changedTicketIds) {
          changedTicketIds.add(tId);
        }
        lastAppliedEventId = eventId;
      }

      const responseLastEventId = Number(data.lastEventId ?? lastAppliedEventId);
      const lastSyncedEventId = Number.isFinite(responseLastEventId)
        ? Math.max(lastAppliedEventId, responseLastEventId)
        : lastAppliedEventId;

      await tx
        .update(peerConnections)
        .set({
          lastSyncedEventId,
          status: 'active',
          consecutiveFailures: 0,
          nextAttemptAt: null,
          lastAttemptAt: attemptStartedAt,
          lastSuccessAt: new Date(),
          lastError: null,
          lastAppliedCount: rawEvents.length,
        })
        .where(eq(peerConnections.id, connection.id));

      return {
        appliedCount: rawEvents.length,
        lastSyncedEventId,
        changedProjectIds: [...changedProjectIds],
        changedTicketIds: [...changedTicketIds],
      };
    });

    return {
      ok: true as const,
      appliedCount: result.appliedCount,
      lastSyncedEventId: result.lastSyncedEventId,
      changedProjectIds: result.changedProjectIds,
      changedTicketIds: result.changedTicketIds,
    };
  } catch (error) {
    return {
      ok: false as const,
      status: 500,
      error: error instanceof Error ? error.message : 'Failed to apply federation outbox events.',
    };
  }
}

export async function runFederationSyncSweep() {
  const connectionRows = await db
    .select({
      id: peerConnections.id,
      status: peerConnections.status,
      consecutiveFailures: peerConnections.consecutiveFailures,
      nextAttemptAt: peerConnections.nextAttemptAt,
      lastAttemptAt: peerConnections.lastAttemptAt,
      lastSuccessAt: peerConnections.lastSuccessAt,
      lastError: peerConnections.lastError,
      lastAppliedCount: peerConnections.lastAppliedCount,
    })
    .from(peerConnections)
    .where(eq(peerConnections.status, 'active'));

  const activeConnectionIds = new Set(connectionRows.map(({ id }) => id));
  for (const trackedConnectionId of federationSyncStates.keys()) {
    if (!activeConnectionIds.has(trackedConnectionId) && !inFlightFederationSyncs.has(trackedConnectionId)) {
      federationSyncStates.delete(trackedConnectionId);
    }
  }

  await Promise.allSettled(
    connectionRows.map(async (connection) => {
      const { id } = connection;
      if (inFlightFederationSyncs.has(id)) {
        return;
      }

      const syncState = getFederationSyncState(id, {
        consecutiveFailures: connection.consecutiveFailures,
        nextAttemptAt: connection.nextAttemptAt,
        lastAttemptAt: connection.lastAttemptAt,
        lastSuccessAt: connection.lastSuccessAt,
        lastError: connection.lastError,
        lastAppliedCount: connection.lastAppliedCount,
      });
      const now = Date.now();
      if (syncState.nextAttemptAtMs > now) {
        return;
      }

      inFlightFederationSyncs.add(id);
      syncState.lastAttemptAtMs = now;
      try {
        await persistFederationSyncState(id, connection.status, syncState);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown sync bookkeeping failure.';
        console.warn(`federation sync bookkeeping failed for connection ${id}; skipping this sweep attempt: ${message}`);
        inFlightFederationSyncs.delete(id);
        return;
      }

      try {
        const result = await syncFederatedConnection({ connectionId: id, limit: 50 });
        if (!result.ok) {
          syncState.consecutiveFailures += 1;
          syncState.lastError = result.error;
          syncState.lastAppliedCount = 0;
          const exhaustedRetries = syncState.consecutiveFailures >= env.federationSyncFailureMaxRetries;
          const backoffDelay = exhaustedRetries
            ? 0
            : (env.federationSyncFailureBaseMs * 2 ** Math.max(0, syncState.consecutiveFailures - 1));
          syncState.nextAttemptAtMs = exhaustedRetries
            ? 0
            : Date.now() + Math.min(backoffDelay, env.federationSyncFailureMaxMs);

          await persistFederationSyncState(id, exhaustedRetries ? 'failed' : 'active', syncState);

          if (exhaustedRetries) {
            console.warn(
              `federation sync failed for connection ${id}; marking failed after ${syncState.consecutiveFailures} attempts: ${result.error}`,
            );
            federationSyncStates.delete(id);
            return;
          }

          console.warn(
            `federation sync failed for connection ${id}; retrying in ${syncState.nextAttemptAtMs - Date.now()}ms: ${result.error}`,
          );
          return;
        }

        const recoveredFromFailure = syncState.consecutiveFailures > 0;
        syncState.consecutiveFailures = 0;
        syncState.nextAttemptAtMs = 0;
        syncState.lastSuccessAtMs = Date.now();
        syncState.lastError = null;
        syncState.lastAppliedCount = result.appliedCount;

        if (recoveredFromFailure || result.appliedCount > 0) {
          console.info(
            `federation sync completed for connection ${id}: applied=${result.appliedCount} lastSyncedEventId=${result.lastSyncedEventId}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown sync failure.';
        syncState.consecutiveFailures += 1;
        syncState.lastError = message;
        syncState.lastAppliedCount = 0;
        const exhaustedRetries = syncState.consecutiveFailures >= env.federationSyncFailureMaxRetries;
        const backoffDelay = exhaustedRetries
          ? 0
          : (env.federationSyncFailureBaseMs * 2 ** Math.max(0, syncState.consecutiveFailures - 1));
        syncState.nextAttemptAtMs = exhaustedRetries
          ? 0
          : Date.now() + Math.min(backoffDelay, env.federationSyncFailureMaxMs);

        await persistFederationSyncState(id, exhaustedRetries ? 'failed' : 'active', syncState);

        if (exhaustedRetries) {
          console.warn(
            `federation sync crashed for connection ${id}; marking failed after ${syncState.consecutiveFailures} attempts: ${message}`,
          );
          federationSyncStates.delete(id);
          return;
        }

        console.warn(
          `federation sync crashed for connection ${id}; retrying in ${syncState.nextAttemptAtMs - Date.now()}ms: ${message}`,
        );
      } finally {
        inFlightFederationSyncs.delete(id);
      }
    }),
  );
}

export function startFederationSyncLoop() {
  if (env.federationSyncIntervalMs <= 0 || federationSyncTimer) {
    return;
  }

  console.info(
    `federation sync loop started: interval=${env.federationSyncIntervalMs}ms baseBackoff=${env.federationSyncFailureBaseMs}ms maxBackoff=${env.federationSyncFailureMaxMs}ms maxRetries=${env.federationSyncFailureMaxRetries}`,
  );
  void runFederationSyncSweep();
  federationSyncTimer = setInterval(() => {
    void runFederationSyncSweep();
  }, env.federationSyncIntervalMs);
  federationSyncTimer.unref();
}

export function stopFederationSyncLoop() {
  if (!federationSyncTimer) {
    return;
  }

  clearInterval(federationSyncTimer);
  federationSyncTimer = null;
  inFlightFederationSyncs.clear();
  federationSyncStates.clear();
}
