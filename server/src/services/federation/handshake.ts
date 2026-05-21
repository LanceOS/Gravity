import { eq } from 'drizzle-orm';
import { sign, verify } from 'node:crypto';
import { db } from '../../db/index.js';
import { federationInvites, peerConnections, workspacePeers } from '../../db/schema.js';
import { env } from '../../env.js';
import { decryptNodePrivateKey } from '../../lib/crypto.js';
import { normalizeFederationPublicKey, isFederationTimestampFresh } from '../../lib/http-signatures.js';
import { ensureLocalNodeIdentity } from '../../lib/node-identity.js';
import { createId, normalizeEntityKey } from '../../lib/platform.js';
import {
  ensureFederatedWorkspaceReplica,
  getWorkspaceById,
  listWorkspaceProjectsForFederation,
  upsertRemoteIdentity,
} from './db-helpers.js';
import type { FederatedWorkspaceReplica } from './types.js';
import { asString, createInviteToken, isRecord } from './utils.js';

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

export async function acceptFederationHandshake(input: {
  inviteToken: string;
  guestPublicKey: string;
  guestDisplayName: string;
  guestHostUrl?: string;
  handshakeSignature: string;
  handshakeTimestamp: string;
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

  if (!isFederationTimestampFresh(input.handshakeTimestamp)) {
    return { ok: false as const, status: 401, error: 'Handshake timestamp is outside the accepted window.' };
  }

  const challenge = [input.inviteToken, input.handshakeTimestamp, input.guestHostUrl || ''].join('\n');
  try {
    const verified = verify(
      null,
      Buffer.from(challenge, 'utf8'),
      normalizeFederationPublicKey(input.guestPublicKey),
      Buffer.from(input.handshakeSignature, 'base64'),
    );
    if (!verified) {
      return { ok: false as const, status: 401, error: 'Invalid handshake signature.' };
    }
  } catch (err) {
    return { ok: false as const, status: 400, error: 'Cryptographic verification failed.' };
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

export async function connectToFederatedWorkspace(input: {
  hostUrl: string;
  inviteToken: string;
}) {
  const hostUrl = input.hostUrl.trim().replace(/\/$/, '');
  if (!hostUrl) {
    return { ok: false as const, status: 400, error: 'hostUrl is required.' };
  }

  const localNodeIdentity = await ensureLocalNodeIdentity();
  const timestamp = new Date().toISOString();
  const challenge = [input.inviteToken, timestamp, env.betterAuthBaseUrl].join('\n');
  const privateKey = decryptNodePrivateKey(localNodeIdentity.encryptedPrivateKey);
  if (!privateKey) {
    throw new Error('Failed to decrypt local node private key.');
  }

  let handshakeSignature: string;
  try {
    handshakeSignature = sign(null, Buffer.from(challenge, 'utf8'), privateKey).toString('base64');
  } catch (err) {
    throw new Error('Failed to generate cryptographic handshake signature.');
  }

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
      handshakeSignature,
      handshakeTimestamp: timestamp,
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
      typeof workspaceRecord?.defaultProjectId === 'string'
        ? workspaceRecord.defaultProjectId
        : workspaceRecord?.defaultProjectId === null
          ? null
          : null,
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
