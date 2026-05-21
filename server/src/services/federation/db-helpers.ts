import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  authUsers,
  comments,
  identities,
  peerConnections,
  projects,
  tickets,
  userProfiles,
  workspaceMembers,
  workspacePeers,
  workspaceSettings,
  workspaces,
} from '../../db/schema.js';
import { normalizeFederationPublicKey } from '../../lib/http-signatures.js';
import { createId, normalizeEntityKey, normalizeIsoDate } from '../../lib/platform.js';
import type { FederatedProjectReplica, FederatedWorkspaceReplica } from './types.js';
import { parseFederationDate } from './utils.js';

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

export function mapWorkspaceReplica(record: typeof workspaces.$inferSelect): FederatedWorkspaceReplica {
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

export function mapProjectReplica(record: typeof projects.$inferSelect): FederatedProjectReplica {
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

export function mapTicketRecord(record: typeof tickets.$inferSelect) {
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

export function mapCommentRecord(record: typeof comments.$inferSelect) {
  return {
    id: record.id,
    ticketId: record.ticketId,
    userId: record.userId,
    body: record.body,
    createdAt: normalizeIsoDate(record.createdAt),
  };
}

export async function listWorkspaceProjectsForFederation(workspaceId: string) {
  const rows = await db.select().from(projects).where(eq(projects.workspaceId, workspaceId)).orderBy(asc(projects.createdAt));
  return rows.map(mapProjectReplica);
}

export async function ensureFederatedWorkspaceReplica(input: {
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

export async function getWorkspaceProjectRecordForFederation(workspaceId: string, projectId: string) {
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

export async function getFederatedTicketWithProject(workspaceId: string, ticketId: string) {
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

export async function getFederatedCommentContext(workspaceId: string, ticketId: string) {
  const existing = await getFederatedTicketWithProject(workspaceId, ticketId);
  if (!existing) {
    return null;
  }

  return existing;
}
