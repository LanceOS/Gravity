import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { federationInvites, identities, peerConnections, projects, syncOutbox, tickets, workspaceMembers, workspacePeers, workspaces } from '../db/schema.js';
import { env } from '../env.js';
import { normalizeFederationPublicKey } from '../lib/http-signatures.js';
import { createId, normalizeEntityKey, normalizeIsoDate } from '../lib/platform.js';
import { ensureLocalNodeIdentity } from '../lib/node-identity.js';

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

  const projectRows = await db
    .select({ id: projects.id, key: projects.key, workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, input.ticket.projectId))
    .limit(1);
  const project = projectRows[0];
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

  const hostIdentity = await upsertRemoteIdentity({
    publicKey: String(data.hostPublicKey ?? ''),
    displayName: String(data.hostDisplayName ?? ''),
  });

  const rows = await db
    .insert(peerConnections)
    .values({
      id: createId('pcn'),
      workspaceId: String(data.workspaceId ?? ''),
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