import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { authUsers, comments, projects, syncOutbox, tickets, userProfiles } from '../../db/schema.js';
import { createId, normalizeEntityKey } from '../../lib/platform.js';
import {
  getFederatedCommentContext,
  getFederatedTicketWithProject,
  getVerifiedWorkspacePeerByPublicKey,
  getWorkspaceProjectRecordForFederation,
  mapCommentRecord,
  mapProjectReplica,
  mapTicketRecord,
} from './db-helpers.js';
import type { FederatedTicketUpdate } from './types.js';
import {
  createFederatedAuthorAvatar,
  createFederatedAuthorEmail,
  createFederatedAuthorId,
} from './utils.js';

export function buildFederatedTicketUpdatePayload(updates: FederatedTicketUpdate) {
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

export async function ensureFederatedCommentAuthor(input: {
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
        outboxEventId: number | null;
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
