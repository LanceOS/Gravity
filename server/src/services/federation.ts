import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { federationInvites, identities, peerConnections, projects, syncOutbox, tickets, workspaceMembers, workspacePeers, workspaceSettings, workspaces } from '../db/schema.js';
import { env } from '../env.js';
import { decryptNodePrivateKey } from '../lib/crypto.js';
import { createSignedFederationHeaders, normalizeFederationPublicKey } from '../lib/http-signatures.js';
import { createId, normalizeEntityKey, normalizeIsoDate } from '../lib/platform.js';
import { ensureLocalNodeIdentity } from '../lib/node-identity.js';

type FederatedWorkspaceReplica = {
  id: string;
  name: string;
  description: string;
  key: string;
  workspaceKey: string;
  defaultProjectId: string | null;
  hostUrl: string;
  createdBy: string;
  createdAt: string;
};

type FederatedProjectReplica = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  key: string;
  status: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : value === null ? null : undefined;
}

function parseFederationDate(value: unknown, fallback = new Date()) {
  const parsed = typeof value === 'string' || value instanceof Date ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function createInviteToken() {
  return `fed_${randomUUID().replace(/-/g, '')}`;
}

export async function ensureWorkspaceAdminAccess(workspaceId: string, userId: string) {
  const rows = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);

  const membership = rows[0];
  return Boolean(membership && ['owner', 'admin'].includes(membership.role));
}

export async function getWorkspaceById(workspaceId: string) {
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return rows[0] ?? null;
}

function mapWorkspaceReplica(record: typeof workspaces.$inferSelect): FederatedWorkspaceReplica {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    key: record.key,
    workspaceKey: record.workspaceKey,
    defaultProjectId: record.defaultProjectId,
    hostUrl: record.hostUrl,
    createdBy: record.createdBy,
    createdAt: normalizeIsoDate(record.createdAt),
  };
}

function mapProjectReplica(record: typeof projects.$inferSelect): FederatedProjectReplica {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    description: record.description,
    key: record.key,
    status: record.status,
    inviteCode: record.inviteCode,
    createdBy: record.createdBy,
    createdAt: normalizeIsoDate(record.createdAt),
    updatedAt: normalizeIsoDate(record.updatedAt),
  };
}

export async function listWorkspaceProjectsForFederation(workspaceId: string) {
  const rows = await db.select().from(projects).where(eq(projects.workspaceId, workspaceId)).orderBy(asc(projects.createdAt));
  return rows.map(mapProjectReplica);
}

async function ensureFederatedWorkspaceReplica(input: {
  workspace: FederatedWorkspaceReplica;
  projects: FederatedProjectReplica[];
}) {
  await db.transaction(async (tx) => {
    await tx
      .insert(workspaces)
      .values({
        id: input.workspace.id,
        name: input.workspace.name,
        description: input.workspace.description,
        key: input.workspace.key,
        workspaceKey: input.workspace.workspaceKey,
        defaultProjectId: input.workspace.defaultProjectId,
        hostUrl: input.workspace.hostUrl,
        createdBy: input.workspace.createdBy,
        createdAt: parseFederationDate(input.workspace.createdAt),
      })
      .onConflictDoUpdate({
        target: workspaces.id,
        set: {
          name: input.workspace.name,
          description: input.workspace.description,
          key: input.workspace.key,
          workspaceKey: input.workspace.workspaceKey,
          defaultProjectId: input.workspace.defaultProjectId,
          hostUrl: input.workspace.hostUrl,
          createdBy: input.workspace.createdBy,
          createdAt: parseFederationDate(input.workspace.createdAt),
        },
      });

    await tx
      .insert(workspaceSettings)
      .values({
        workspaceId: input.workspace.id,
        hostUrl: input.workspace.hostUrl,
        joinMode: 'approval_required',
        createdAt: parseFederationDate(input.workspace.createdAt),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: workspaceSettings.workspaceId,
        set: {
          hostUrl: input.workspace.hostUrl,
          updatedAt: new Date(),
        },
      });

    for (const project of input.projects) {
      await tx
        .insert(projects)
        .values({
          id: project.id,
          workspaceId: project.workspaceId,
          name: project.name,
          description: project.description,
          key: project.key,
          status: project.status,
          inviteCode: project.inviteCode,
          createdBy: project.createdBy,
          createdAt: parseFederationDate(project.createdAt),
          updatedAt: parseFederationDate(project.updatedAt),
        })
        .onConflictDoUpdate({
          target: projects.id,
          set: {
            workspaceId: project.workspaceId,
            name: project.name,
            description: project.description,
            key: project.key,
            status: project.status,
            inviteCode: project.inviteCode,
            createdBy: project.createdBy,
            createdAt: parseFederationDate(project.createdAt),
            updatedAt: parseFederationDate(project.updatedAt),
          },
        });
    }
  });
}

export async function createFederationInvite(input: {
  workspaceId: string;
  issuedByUserId: string;
  expirationHours?: number;
}) {
  const expirationHours = input.expirationHours && input.expirationHours > 0 ? input.expirationHours : 24;
  const invite = {
    id: createId('fiv'),
    workspaceId: input.workspaceId,
    issuedByUserId: input.issuedByUserId,
    inviteToken: createInviteToken(),
    expiresAt: new Date(Date.now() + expirationHours * 60 * 60 * 1000),
    revokedAt: null,
    acceptedAt: null,
    acceptedByPublicKey: null,
    createdAt: new Date(),
  };

  await db.insert(federationInvites).values(invite);
  return invite;
}

export async function upsertRemoteIdentity(input: {
  publicKey: string;
  displayName: string;
}) {
  const normalizedPublicKey = normalizeFederationPublicKey(input.publicKey);
  const existingRows = await db.select().from(identities).where(eq(identities.publicKey, normalizedPublicKey)).limit(1);
  const existingIdentity = existingRows[0];

  if (existingIdentity) {
    const rows = await db
      .update(identities)
      .set({
        displayName: input.displayName || existingIdentity.displayName,
      })
      .where(eq(identities.id, existingIdentity.id))
      .returning();

    return rows[0] ?? existingIdentity;
  }

  const rows = await db
    .insert(identities)
    .values({
      id: createId('idn'),
      displayName: input.displayName,
      publicKey: normalizedPublicKey,
      encryptedPrivateKey: null,
      isLocalOwner: false,
      createdAt: new Date(),
    })
    .returning();

  return rows[0];
}

export async function acceptFederationHandshake(input: {
  inviteToken: string;
  guestPublicKey: string;
  guestDisplayName: string;
  guestHostUrl?: string;
}) {
  const inviteRows = await db
    .select()
    .from(federationInvites)
    .where(eq(federationInvites.inviteToken, input.inviteToken))
    .limit(1);
  const invite = inviteRows[0];

  if (!invite) {
    return { ok: false as const, status: 404, error: 'Federation invite not found.' };
  }

  if (invite.revokedAt) {
    return { ok: false as const, status: 400, error: 'Federation invite has been revoked.' };
  }

  if (invite.acceptedAt) {
    return { ok: false as const, status: 400, error: 'Federation invite has already been used.' };
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, status: 400, error: 'Federation invite has expired.' };
  }

  const workspace = await getWorkspaceById(invite.workspaceId);
  if (!workspace) {
    return { ok: false as const, status: 404, error: 'Workspace not found for federation invite.' };
  }
  const workspaceProjects = await listWorkspaceProjectsForFederation(workspace.id);

  const guestIdentity = await upsertRemoteIdentity({
    publicKey: input.guestPublicKey,
    displayName: input.guestDisplayName,
  });
  const localNodeIdentity = await ensureLocalNodeIdentity();

  await db.transaction(async (tx) => {
    await tx
      .insert(workspacePeers)
      .values({
        workspaceId: invite.workspaceId,
        identityId: guestIdentity.id,
        invitedByUserId: invite.issuedByUserId,
        peerHostUrl: input.guestHostUrl?.trim() || '',
        status: 'verified',
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [workspacePeers.workspaceId, workspacePeers.identityId],
        set: {
          invitedByUserId: invite.issuedByUserId,
          peerHostUrl: input.guestHostUrl?.trim() || '',
          status: 'verified',
        },
      });

    await tx
      .update(federationInvites)
      .set({
        acceptedAt: new Date(),
        acceptedByPublicKey: input.guestPublicKey,
      })
      .where(eq(federationInvites.id, invite.id));
  });

  return {
    ok: true as const,
    workspace,
    workspaceProjects,
    localNodeIdentity,
    guestIdentity,
  };
}

export async function listWorkspacePeers(workspaceId: string) {
  const rows = await db
    .select({
      workspaceId: workspacePeers.workspaceId,
      peerHostUrl: workspacePeers.peerHostUrl,
      status: workspacePeers.status,
      createdAt: workspacePeers.createdAt,
      identityId: identities.id,
      displayName: identities.displayName,
      publicKey: identities.publicKey,
    })
    .from(workspacePeers)
    .innerJoin(identities, eq(identities.id, workspacePeers.identityId))
    .where(eq(workspacePeers.workspaceId, workspaceId));

  return rows;
}

export async function getVerifiedWorkspacePeerByPublicKey(workspaceId: string, publicKey: string) {
  const normalizedPublicKey = normalizeFederationPublicKey(publicKey);
  const rows = await db
    .select({
      workspaceId: workspacePeers.workspaceId,
      identityId: identities.id,
      displayName: identities.displayName,
      publicKey: identities.publicKey,
      status: workspacePeers.status,
    })
    .from(workspacePeers)
    .innerJoin(identities, eq(identities.id, workspacePeers.identityId))
    .where(and(eq(workspacePeers.workspaceId, workspaceId), eq(identities.publicKey, normalizedPublicKey)))
    .limit(1);

  const peer = rows[0];
  if (!peer || peer.status !== 'verified') {
    return null;
  }

  return peer;
}

function mapTicketRecord(record: typeof tickets.$inferSelect) {
  return {
    id: record.id,
    key: record.key,
    title: record.title,
    description: record.description,
    status: record.status,
    priority: record.priority,
    assigneeId: record.assigneeId,
    projectId: record.projectId,
    domainId: record.domainId,
    cycleId: record.cycleId,
    parentId: record.parentId,
    prStatus: record.prStatus,
    prUrl: record.prUrl,
    createdAt: normalizeIsoDate(record.createdAt),
    updatedAt: normalizeIsoDate(record.updatedAt),
  };
}

type FederatedTicketUpdate = Partial<{
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  domainId: string | null;
  cycleId: string | null;
  parentId: string | null;
  prStatus: string;
  prUrl: string | null;
}>;

async function getWorkspaceProjectRecordForFederation(workspaceId: string, projectId: string) {
  const projectRows = await db
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      name: projects.name,
      description: projects.description,
      key: projects.key,
      status: projects.status,
      inviteCode: projects.inviteCode,
      createdBy: projects.createdBy,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const project = projectRows[0];
  if (!project || project.workspaceId !== workspaceId) {
    return null;
  }

  return project;
}

async function getFederatedTicketWithProject(workspaceId: string, ticketId: string) {
  const ticketRows = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  const ticket = ticketRows[0];
  if (!ticket) {
    return null;
  }

  const project = await getWorkspaceProjectRecordForFederation(workspaceId, ticket.projectId);
  if (!project) {
    return null;
  }

  return { ticket, project };
}

function buildFederatedTicketUpdatePayload(updates: FederatedTicketUpdate) {
  return {
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
    ...(updates.assigneeId !== undefined ? { assigneeId: updates.assigneeId } : {}),
    ...(updates.domainId !== undefined ? { domainId: updates.domainId } : {}),
    ...(updates.cycleId !== undefined ? { cycleId: updates.cycleId } : {}),
    ...(updates.parentId !== undefined ? { parentId: updates.parentId } : {}),
    ...(updates.prStatus !== undefined ? { prStatus: updates.prStatus } : {}),
    ...(updates.prUrl !== undefined ? { prUrl: updates.prUrl } : {}),
  };
}

export async function createFederatedTicket(input: {
  workspaceId: string;
  actorPublicKey: string;
  ticket: {
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    projectId: string;
    domainId?: string | null;
    cycleId?: string | null;
    assigneeId?: string | null;
    parentId?: string | null;
  };
}) {
  const verifiedPeer = await getVerifiedWorkspacePeerByPublicKey(input.workspaceId, input.actorPublicKey);
  if (!verifiedPeer) {
    return { ok: false as const, status: 403, error: 'Peer is not verified for this workspace.' };
  }

  const project = await getWorkspaceProjectRecordForFederation(input.workspaceId, input.ticket.projectId);
  if (!project || project.workspaceId !== input.workspaceId) {
    return { ok: false as const, status: 404, error: 'Project not found for workspace.' };
  }

  const result = await db.transaction(async (tx) => {
    const existing = await tx.execute(sql`
      SELECT key
      FROM tickets
      WHERE project_id = ${input.ticket.projectId}
        AND key LIKE ${`${normalizeEntityKey(project.key)}-%`}
    `);

    const maxValue = (existing.rows as Array<{ key: string }>).reduce((highest, row) => {
      const numeric = Number(row.key.split('-').pop() ?? 0);
      return Number.isFinite(numeric) && numeric > highest ? numeric : highest;
    }, 0);

    const ticketRows = await tx
      .insert(tickets)
      .values({
        id: createId('ti'),
        key: `${normalizeEntityKey(project.key)}-${maxValue + 1}`,
        title: input.ticket.title,
        description: input.ticket.description ?? '',
        status: input.ticket.status ?? 'todo',
        priority: input.ticket.priority ?? 'no_priority',
        projectId: input.ticket.projectId,
        domainId: input.ticket.domainId ?? null,
        cycleId: input.ticket.cycleId ?? null,
        assigneeId: input.ticket.assigneeId ?? null,
        parentId: input.ticket.parentId ?? null,
        prStatus: 'none',
        prUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const createdTicket = ticketRows[0];
    const outboxRows = await tx
      .insert(syncOutbox)
      .values({
        workspaceId: input.workspaceId,
        actorPublicKey: input.actorPublicKey,
        entityType: 'ticket',
        entityId: createdTicket.id,
        action: 'create',
        payload: {
          project: mapProjectReplica(project),
          ticket: mapTicketRecord(createdTicket),
        },
        createdAt: new Date(),
      })
      .returning();

    return {
      ticket: mapTicketRecord(createdTicket),
      outboxEventId: outboxRows[0]?.eventId ?? null,
    };
  });

  return {
    ok: true as const,
    ticket: result.ticket,
    outboxEventId: result.outboxEventId,
  };
}

export async function updateFederatedTicket(input: {
  workspaceId: string;
  actorPublicKey: string;
  ticketId: string;
  updates: FederatedTicketUpdate;
}) {
  const verifiedPeer = await getVerifiedWorkspacePeerByPublicKey(input.workspaceId, input.actorPublicKey);
  if (!verifiedPeer) {
    return { ok: false as const, status: 403, error: 'Peer is not verified for this workspace.' };
  }

  const existing = await getFederatedTicketWithProject(input.workspaceId, input.ticketId);
  if (!existing) {
    return { ok: false as const, status: 404, error: 'Ticket not found for workspace.' };
  }

  const updatePayload = buildFederatedTicketUpdatePayload(input.updates);
  if (Object.keys(updatePayload).length === 0) {
    return { ok: false as const, status: 400, error: 'At least one updatable ticket field is required.' };
  }

  const result = await db.transaction(async (tx) => {
    const updatedTicketRows = await tx
      .update(tickets)
      .set({
        ...updatePayload,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, input.ticketId))
      .returning();

    const updatedTicket = updatedTicketRows[0];
    const outboxRows = await tx
      .insert(syncOutbox)
      .values({
        workspaceId: input.workspaceId,
        actorPublicKey: input.actorPublicKey,
        entityType: 'ticket',
        entityId: updatedTicket.id,
        action: 'update',
        payload: {
          project: mapProjectReplica(existing.project),
          ticket: mapTicketRecord(updatedTicket),
        },
        createdAt: new Date(),
      })
      .returning();

    return {
      ticket: mapTicketRecord(updatedTicket),
      outboxEventId: outboxRows[0]?.eventId ?? null,
    };
  });

  return {
    ok: true as const,
    ticket: result.ticket,
    outboxEventId: result.outboxEventId,
  };
}

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
        if (entityType !== 'ticket' || (action !== 'create' && action !== 'update')) {
          throw new Error(`Unsupported federation event ${entityType}:${action}.`);
        }
        if (!payload) {
          throw new Error(`Federation event ${eventId} is missing a payload.`);
        }

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
                  createdAt: parseFederationDate(projectPayload.createdAt),
                  updatedAt: parseFederationDate(projectPayload.updatedAt),
                },
              });
          }
        }

        const ticketPayload = isRecord(payload.ticket) ? payload.ticket : null;
        if (!ticketPayload) {
          throw new Error(`Federation ticket event ${eventId} is missing ticket data.`);
        }

        const ticketId = asString(ticketPayload.id);
        const ticketKey = asString(ticketPayload.key);
        const ticketTitle = asString(ticketPayload.title);
        const projectId = asString(ticketPayload.projectId);

        if (!ticketId || !ticketKey || !ticketTitle || !projectId) {
          throw new Error(`Federation ticket event ${eventId} is missing required ticket fields.`);
        }

        const localProjectRows = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
        if (!localProjectRows[0]) {
          throw new Error(`Missing local project replica ${projectId} for federation event ${eventId}.`);
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
              createdAt: parseFederationDate(ticketPayload.createdAt),
              updatedAt: parseFederationDate(ticketPayload.updatedAt),
            },
          });

        changedProjectIds.add(projectId);
        lastAppliedEventId = eventId;
      }

      const responseLastEventId = Number(data.lastEventId ?? lastAppliedEventId);
      const lastSyncedEventId = Number.isFinite(responseLastEventId) ? Math.max(lastAppliedEventId, responseLastEventId) : lastAppliedEventId;

      await tx
        .update(peerConnections)
        .set({
          lastSyncedEventId,
          status: 'active',
        })
        .where(eq(peerConnections.id, connection.id));

      return {
        appliedCount: rawEvents.length,
        lastSyncedEventId,
        changedProjectIds: [...changedProjectIds],
      };
    });

    return {
      ok: true as const,
      appliedCount: result.appliedCount,
      lastSyncedEventId: result.lastSyncedEventId,
      changedProjectIds: result.changedProjectIds,
    };
  } catch (error) {
    return {
      ok: false as const,
      status: 500,
      error: error instanceof Error ? error.message : 'Failed to apply federation outbox events.',
    };
  }
}

export async function connectToFederatedWorkspace(input: {
  hostUrl: string;
  inviteToken: string;
}) {
  const hostUrl = input.hostUrl.trim().replace(/\/$/, '');
  if (!hostUrl) {
    return { ok: false as const, status: 400, error: 'hostUrl is required.' };
  }

  const localNodeIdentity = await ensureLocalNodeIdentity();
  const response = await fetch(`${hostUrl}/api/v1/federation/handshakes/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inviteToken: input.inviteToken,
      guestPublicKey: localNodeIdentity.publicKey,
      guestDisplayName: localNodeIdentity.displayName,
      guestHostUrl: env.betterAuthBaseUrl,
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      error: typeof data.error === 'string' ? data.error : 'Failed to connect to the host node.',
    };
  }

  const workspaceRecord = isRecord(data.workspace) ? data.workspace : null;
  const workspaceReplica: FederatedWorkspaceReplica = {
    id: asString(workspaceRecord?.id ?? data.workspaceId),
    name: asString(workspaceRecord?.name ?? data.workspaceName, 'Federated Workspace'),
    description: asString(workspaceRecord?.description),
    key: normalizeEntityKey(asString(workspaceRecord?.key ?? data.workspaceId, 'FEDERATED')),
    workspaceKey: asString(workspaceRecord?.workspaceKey, `fed_${asString(workspaceRecord?.id ?? data.workspaceId, 'workspace')}`),
    defaultProjectId:
      typeof workspaceRecord?.defaultProjectId === 'string' ? workspaceRecord.defaultProjectId : workspaceRecord?.defaultProjectId === null ? null : null,
    hostUrl: asString(workspaceRecord?.hostUrl, hostUrl),
    createdBy: asString(workspaceRecord?.createdBy, 'federated-host'),
    createdAt: asString(workspaceRecord?.createdAt, new Date().toISOString()),
  };
  if (!workspaceReplica.id) {
    return { ok: false as const, status: 502, error: 'Host handshake did not return a workspace identifier.' };
  }

  const workspaceProjects = Array.isArray(data.projects)
    ? data.projects.filter(isRecord).map((project) => ({
        id: asString(project.id),
        workspaceId: asString(project.workspaceId, workspaceReplica.id),
        name: asString(project.name, 'Federated Project'),
        description: asString(project.description),
        key: asString(project.key),
        status: asString(project.status, 'active'),
        inviteCode: asString(project.inviteCode, `fed-${asString(project.id)}`),
        createdBy: asString(project.createdBy, 'federated-host'),
        createdAt: asString(project.createdAt, new Date().toISOString()),
        updatedAt: asString(project.updatedAt, new Date().toISOString()),
      }))
    : [];

  await ensureFederatedWorkspaceReplica({
    workspace: workspaceReplica,
    projects: workspaceProjects.filter((project) => project.id),
  });

  const hostIdentity = await upsertRemoteIdentity({
    publicKey: String(data.hostPublicKey ?? ''),
    displayName: String(data.hostDisplayName ?? ''),
  });

  const rows = await db
    .insert(peerConnections)
    .values({
      id: createId('pcn'),
      workspaceId: workspaceReplica.id,
      hostUrl,
      hostDisplayName: hostIdentity.displayName,
      hostPublicKey: hostIdentity.publicKey,
      lastSyncedEventId: 0,
      status: 'active',
      createdAt: new Date(),
    })
    .returning();

  return {
    ok: true as const,
    connection: rows[0],
    hostIdentity,
  };
}