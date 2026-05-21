import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authUsers, comments, federationInvites, identities, peerConnections, projects, syncOutbox, tickets, userProfiles, workspaceMembers, workspacePeers, workspaceSettings, workspaces } from '../db/schema.js';
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

let federationSyncTimer: NodeJS.Timeout | null = null;
const inFlightFederationSyncs = new Set<string>();

type FederationSyncConnectionState = {
  consecutiveFailures: number;
  nextAttemptAtMs: number;
  lastAttemptAtMs: number | null;
  lastSuccessAtMs: number | null;
  lastError: string | null;
  lastAppliedCount: number;
};

type FederationSyncStateSeed = {
  consecutiveFailures: number;
  nextAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastAppliedCount: number;
};

const federationSyncStates = new Map<string, FederationSyncConnectionState>();

function getFederationSyncState(connectionId: string, seed?: FederationSyncStateSeed) {
  const existing = federationSyncStates.get(connectionId);
  if (existing) {
    return existing;
  }

  const state: FederationSyncConnectionState = {
    consecutiveFailures: seed?.consecutiveFailures ?? 0,
    nextAttemptAtMs: seed?.nextAttemptAt ? seed.nextAttemptAt.getTime() : 0,
    lastAttemptAtMs: seed?.lastAttemptAt ? seed.lastAttemptAt.getTime() : null,
    lastSuccessAtMs: seed?.lastSuccessAt ? seed.lastSuccessAt.getTime() : null,
    lastError: seed?.lastError ?? null,
    lastAppliedCount: seed?.lastAppliedCount ?? 0,
  };
  federationSyncStates.set(connectionId, state);
  return state;
}

function mapFederationSyncStateToRecord(state: FederationSyncConnectionState) {
  return {
    consecutiveFailures: state.consecutiveFailures,
    nextAttemptAt: state.nextAttemptAtMs > 0 ? new Date(state.nextAttemptAtMs) : null,
    lastAttemptAt: state.lastAttemptAtMs ? new Date(state.lastAttemptAtMs) : null,
    lastSuccessAt: state.lastSuccessAtMs ? new Date(state.lastSuccessAtMs) : null,
    lastError: state.lastError,
    lastAppliedCount: state.lastAppliedCount,
  };
}

async function persistFederationSyncState(connectionId: string, status: string, state: FederationSyncConnectionState) {
  await db
    .update(peerConnections)
    .set({
      status,
      ...mapFederationSyncStateToRecord(state),
    })
    .where(eq(peerConnections.id, connectionId));
}

export async function recordFederationSyncFailure(connectionId: string, errorMessage: string) {
  const rows = await db
    .select({
      status: peerConnections.status,
      consecutiveFailures: peerConnections.consecutiveFailures,
      nextAttemptAt: peerConnections.nextAttemptAt,
      lastAttemptAt: peerConnections.lastAttemptAt,
      lastSuccessAt: peerConnections.lastSuccessAt,
      lastError: peerConnections.lastError,
      lastAppliedCount: peerConnections.lastAppliedCount,
    })
    .from(peerConnections)
    .where(eq(peerConnections.id, connectionId))
    .limit(1);

  const connection = rows[0];
  if (!connection) {
    return null;
  }

  const syncState = getFederationSyncState(connectionId, {
    consecutiveFailures: connection.consecutiveFailures,
    nextAttemptAt: connection.nextAttemptAt,
    lastAttemptAt: connection.lastAttemptAt,
    lastSuccessAt: connection.lastSuccessAt,
    lastError: connection.lastError,
    lastAppliedCount: connection.lastAppliedCount,
  });
  const failureRecordedAt = Date.now();

  syncState.lastAttemptAtMs = failureRecordedAt;
  syncState.consecutiveFailures += 1;
  syncState.lastError = errorMessage;
  syncState.lastAppliedCount = 0;

  const exhaustedRetries = syncState.consecutiveFailures >= env.federationSyncFailureMaxRetries;
  syncState.nextAttemptAtMs = exhaustedRetries ? 0 : failureRecordedAt + computeFederationSyncBackoffDelay(syncState.consecutiveFailures);

  await persistFederationSyncState(connectionId, exhaustedRetries ? 'failed' : 'active', syncState);

  if (exhaustedRetries) {
    federationSyncStates.delete(connectionId);
  }

  return {
    exhaustedRetries,
    syncState,
  };
}

function computeFederationSyncBackoffDelay(failureCount: number) {
  const exponent = Math.max(0, failureCount - 1);
  return Math.min(env.federationSyncFailureBaseMs * 2 ** exponent, env.federationSyncFailureMaxMs);
}

export function getFederationSyncLoopSnapshot() {
  return [...federationSyncStates.entries()].map(([connectionId, state]) => ({
    connectionId,
    consecutiveFailures: state.consecutiveFailures,
    nextAttemptAtMs: state.nextAttemptAtMs,
    lastAttemptAtMs: state.lastAttemptAtMs,
    lastSuccessAtMs: state.lastSuccessAtMs,
    lastError: state.lastError,
    lastAppliedCount: state.lastAppliedCount,
  }));
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
        acceptedByPublicKey: normalizeFederationPublicKey(input.guestPublicKey),
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

export async function listFederatedConnectionsForUser(input: { userId: string; workspaceId?: string }) {
  const whereClause = input.workspaceId
    ? and(eq(workspaceMembers.userId, input.userId), eq(peerConnections.workspaceId, input.workspaceId))
    : eq(workspaceMembers.userId, input.userId);

  const rows = await db
    .select({
      id: peerConnections.id,
      workspaceId: peerConnections.workspaceId,
      workspaceName: workspaces.name,
      hostUrl: peerConnections.hostUrl,
      hostDisplayName: peerConnections.hostDisplayName,
      hostPublicKey: peerConnections.hostPublicKey,
      lastSyncedEventId: peerConnections.lastSyncedEventId,
      status: peerConnections.status,
      consecutiveFailures: peerConnections.consecutiveFailures,
      nextAttemptAt: peerConnections.nextAttemptAt,
      lastAttemptAt: peerConnections.lastAttemptAt,
      lastSuccessAt: peerConnections.lastSuccessAt,
      lastError: peerConnections.lastError,
      lastAppliedCount: peerConnections.lastAppliedCount,
      createdAt: peerConnections.createdAt,
    })
    .from(peerConnections)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, peerConnections.workspaceId))
    .innerJoin(workspaces, eq(workspaces.id, peerConnections.workspaceId))
    .where(whereClause)
    .orderBy(asc(peerConnections.createdAt));

  return rows.map((row) => {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      hostUrl: row.hostUrl,
      hostDisplayName: row.hostDisplayName,
      hostPublicKey: row.hostPublicKey,
      lastSyncedEventId: row.lastSyncedEventId,
      status: row.status,
      createdAt: normalizeIsoDate(row.createdAt),
      syncState: {
        consecutiveFailures: row.consecutiveFailures,
        nextAttemptAt: row.nextAttemptAt ? normalizeIsoDate(row.nextAttemptAt) : null,
        lastAttemptAt: row.lastAttemptAt ? normalizeIsoDate(row.lastAttemptAt) : null,
        lastSuccessAt: row.lastSuccessAt ? normalizeIsoDate(row.lastSuccessAt) : null,
        lastError: row.lastError,
        lastAppliedCount: row.lastAppliedCount,
      },
    };
  });
}

export async function getFederatedConnectionById(connectionId: string) {
  const rows = await db
    .select({
      id: peerConnections.id,
      workspaceId: peerConnections.workspaceId,
    })
    .from(peerConnections)
    .where(eq(peerConnections.id, connectionId))
    .limit(1);

  return rows[0] ?? null;
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

function mapCommentRecord(record: typeof comments.$inferSelect) {
  return {
    id: record.id,
    ticketId: record.ticketId,
    userId: record.userId,
    body: record.body,
    createdAt: normalizeIsoDate(record.createdAt),
  };
}

function createFederatedAuthorId(publicKey: string) {
  return `fedusr-${createHash('sha256').update(normalizeFederationPublicKey(publicKey)).digest('hex').slice(0, 24)}`;
}

function createFederatedAuthorEmail(userId: string) {
  return `${userId}@gravity.invalid`;
}

function createFederatedAuthorAvatar(seed: string) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

async function ensureFederatedCommentAuthor(input: {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role?: string;
}) {
  const now = new Date();
  const avatarUrl = input.avatarUrl?.trim() || createFederatedAuthorAvatar(input.userId);

  await db
    .insert(authUsers)
    .values({
      id: input.userId,
      name: input.displayName,
      email: createFederatedAuthorEmail(input.userId),
      emailVerified: false,
      image: avatarUrl,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: authUsers.id,
      set: {
        name: input.displayName,
        image: avatarUrl,
        updatedAt: now,
      },
    });

  await db
    .insert(userProfiles)
    .values({
      userId: input.userId,
      role: input.role?.trim() || 'guest_contributor',
      avatarUrl,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        role: input.role?.trim() || 'guest_contributor',
        avatarUrl,
      },
    });
}

async function getFederatedCommentContext(workspaceId: string, ticketId: string) {
  const existing = await getFederatedTicketWithProject(workspaceId, ticketId);
  if (!existing) {
    return null;
  }

  return existing;
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

  const projectKeyPrefix = normalizeEntityKey(project.key);
  const isTicketKeyUniqueViolation = (error: unknown) => {
    if (!(error instanceof Error)) {
      return false;
    }

    const dbError = error as Error & { code?: string; constraint?: string };
    return (
      dbError.code === '23505' &&
      (dbError.constraint === 'tickets_key_unique' ||
        dbError.message.includes('tickets_key') ||
        dbError.message.includes('duplicate key'))
    );
  };

  let result:
    | {
        ticket: ReturnType<typeof mapTicketRecord>;
        outboxEventId: string | null;
      }
    | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await db.transaction(async (tx) => {
        const existing = await tx.execute(sql`
          SELECT key
          FROM tickets
          WHERE project_id = ${input.ticket.projectId}
            AND key LIKE ${`${projectKeyPrefix}-%`}
        `);

        const maxValue = (existing.rows as Array<{ key: string }>).reduce((highest, row) => {
          const numeric = Number(row.key.split('-').pop() ?? 0);
          return Number.isFinite(numeric) && numeric > highest ? numeric : highest;
        }, 0);

        const ticketRows = await tx
          .insert(tickets)
          .values({
            id: createId('ti'),
            key: `${projectKeyPrefix}-${maxValue + 1}`,
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
      break;
    } catch (error) {
      if (attempt === 2 || !isTicketKeyUniqueViolation(error)) {
        throw error;
      }
    }
  }

  if (!result) {
    throw new Error('Failed to allocate a unique ticket key.');
  }

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

export async function deleteFederatedTicket(input: {
  workspaceId: string;
  actorPublicKey: string;
  ticketId: string;
}) {
  const verifiedPeer = await getVerifiedWorkspacePeerByPublicKey(input.workspaceId, input.actorPublicKey);
  if (!verifiedPeer) {
    return { ok: false as const, status: 403, error: 'Peer is not verified for this workspace.' };
  }

  const existing = await getFederatedTicketWithProject(input.workspaceId, input.ticketId);
  if (!existing) {
    return { ok: false as const, status: 404, error: 'Ticket not found for workspace.' };
  }

  const deletedTicket = mapTicketRecord(existing.ticket);
  const result = await db.transaction(async (tx) => {
    await tx.delete(comments).where(eq(comments.ticketId, input.ticketId));
    await tx.delete(tickets).where(eq(tickets.parentId, input.ticketId));
    await tx.delete(tickets).where(eq(tickets.id, input.ticketId));

    const outboxRows = await tx
      .insert(syncOutbox)
      .values({
        workspaceId: input.workspaceId,
        actorPublicKey: input.actorPublicKey,
        entityType: 'ticket',
        entityId: input.ticketId,
        action: 'delete',
        payload: {
          project: mapProjectReplica(existing.project),
          ticket: deletedTicket,
        },
        createdAt: new Date(),
      })
      .returning();

    return {
      ticket: deletedTicket,
      outboxEventId: outboxRows[0]?.eventId ?? null,
    };
  });

  return {
    ok: true as const,
    ticket: result.ticket,
    outboxEventId: result.outboxEventId,
  };
}

export async function createFederatedComment(input: {
  workspaceId: string;
  actorPublicKey: string;
  ticketId: string;
  body: string;
}) {
  const verifiedPeer = await getVerifiedWorkspacePeerByPublicKey(input.workspaceId, input.actorPublicKey);
  if (!verifiedPeer) {
    return { ok: false as const, status: 403, error: 'Peer is not verified for this workspace.' };
  }

  const existing = await getFederatedCommentContext(input.workspaceId, input.ticketId);
  if (!existing) {
    return { ok: false as const, status: 404, error: 'Ticket not found for workspace.' };
  }

  const federatedAuthorId = createFederatedAuthorId(verifiedPeer.publicKey);
  await ensureFederatedCommentAuthor({
    userId: federatedAuthorId,
    displayName: verifiedPeer.displayName,
    avatarUrl: createFederatedAuthorAvatar(verifiedPeer.publicKey),
  });

  const result = await db.transaction(async (tx) => {
    const commentRows = await tx
      .insert(comments)
      .values({
        id: createId('co'),
        ticketId: input.ticketId,
        userId: federatedAuthorId,
        body: input.body,
        createdAt: new Date(),
      })
      .returning();

    const createdComment = commentRows[0];
    const outboxRows = await tx
      .insert(syncOutbox)
      .values({
        workspaceId: input.workspaceId,
        actorPublicKey: input.actorPublicKey,
        entityType: 'comment',
        entityId: createdComment.id,
        action: 'create',
        payload: {
          project: mapProjectReplica(existing.project),
          ticket: mapTicketRecord(existing.ticket),
          comment: {
            ...mapCommentRecord(createdComment),
            userName: verifiedPeer.displayName,
            userAvatar: createFederatedAuthorAvatar(verifiedPeer.publicKey),
            author: {
              id: federatedAuthorId,
              username: verifiedPeer.displayName,
              avatar_url: createFederatedAuthorAvatar(verifiedPeer.publicKey),
              role: 'guest_contributor',
            },
          },
        },
        createdAt: new Date(),
      })
      .returning();

    return {
      comment: {
        ...mapCommentRecord(createdComment),
        userName: verifiedPeer.displayName,
        userAvatar: createFederatedAuthorAvatar(verifiedPeer.publicKey),
        author: {
          id: federatedAuthorId,
          username: verifiedPeer.displayName,
          avatar_url: createFederatedAuthorAvatar(verifiedPeer.publicKey),
          role: 'guest_contributor',
        },
      },
      ticket: mapTicketRecord(existing.ticket),
      outboxEventId: outboxRows[0]?.eventId ?? null,
    };
  });

  return {
    ok: true as const,
    comment: result.comment,
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
        if ((entityType === 'ticket' && action !== 'create' && action !== 'update' && action !== 'delete') || (entityType === 'comment' && action !== 'create') || (entityType !== 'ticket' && entityType !== 'comment')) {
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

        if (entityType === 'comment') {
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

          changedProjectIds.add(projectId);
          changedTicketIds.add(ticketId);
          lastAppliedEventId = eventId;
          continue;
        }

        if (action === 'delete') {
          await tx.delete(comments).where(eq(comments.ticketId, ticketId));
          await tx.delete(tickets).where(eq(tickets.parentId, ticketId));
          await tx.delete(tickets).where(eq(tickets.id, ticketId));

          changedProjectIds.add(projectId);
          changedTicketIds.add(ticketId);
          lastAppliedEventId = eventId;
          continue;
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

        changedProjectIds.add(projectId);
        changedTicketIds.add(ticketId);
        lastAppliedEventId = eventId;
      }

      const responseLastEventId = Number(data.lastEventId ?? lastAppliedEventId);
      const lastSyncedEventId = Number.isFinite(responseLastEventId) ? Math.max(lastAppliedEventId, responseLastEventId) : lastAppliedEventId;

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
          syncState.nextAttemptAtMs = exhaustedRetries ? 0 : Date.now() + computeFederationSyncBackoffDelay(syncState.consecutiveFailures);
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
        syncState.nextAttemptAtMs = exhaustedRetries ? 0 : Date.now() + computeFederationSyncBackoffDelay(syncState.consecutiveFailures);
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