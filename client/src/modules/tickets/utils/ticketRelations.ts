import type { Ticket } from '../../../types/domain';

export type TicketRelation = NonNullable<Ticket['dependencies']>[number];
export type TicketRelationKey = 'dependencies' | 'blockers';

export type TicketWithRelations = Ticket & {
  relatedTicketIds: string[];
};

export type TicketRelationSource = Pick<Ticket, 'dependencies' | 'blockers' | 'blockedTicket'>;

export function collectRelatedTicketIds({
  dependencies,
  blockers,
  blockedTicket,
}: TicketRelationSource) {
  const relatedTicketIds = new Set<string>();

  for (const dependency of dependencies ?? []) {
    relatedTicketIds.add(dependency.id);
  }

  for (const blocker of blockers ?? []) {
    relatedTicketIds.add(blocker.id);
  }

  if (blockedTicket) {
    relatedTicketIds.add(blockedTicket.id);
  }

  return Array.from(relatedTicketIds);
}

export function toTicketRelation(ticket: Pick<Ticket, 'id' | 'key' | 'title' | 'projectId'>): TicketRelation {
  return {
    id: ticket.id,
    key: ticket.key,
    title: ticket.title,
    projectId: ticket.projectId,
  };
}

export function fallbackTicketRelation(ticketId: string): TicketRelation {
  return {
    id: ticketId,
    key: '...',
    title: 'Loading ticket...',
    projectId: '',
  };
}

export function addTicketRelation(relations: TicketRelation[] | undefined, relatedTicket: TicketRelation) {
  const nextRelations = relations ?? [];
  if (nextRelations.some((relation) => relation.id === relatedTicket.id)) {
    return nextRelations;
  }

  return [...nextRelations, relatedTicket];
}

export function removeTicketRelation(relations: TicketRelation[] | undefined, relatedTicketId: string) {
  return (relations ?? []).filter((relation) => relation.id !== relatedTicketId);
}

export function mergeTicketRelationSnapshot(existing: TicketWithRelations | undefined, snapshot: TicketWithRelations) {
  if (!existing) {
    return snapshot;
  }

  const merged = {
    ...existing,
    ...snapshot,
    blockedTicket: snapshot.blockedTicket ?? existing.blockedTicket ?? null,
    dependencies: snapshot.dependencies ?? existing.dependencies,
    blockers: snapshot.blockers ?? existing.blockers,
  };

  return {
    ...merged,
    relatedTicketIds: snapshot.relatedTicketIds?.length > 0
      ? snapshot.relatedTicketIds
      : collectRelatedTicketIds(merged),
  };
}

export function patchTicketRelation(
  ticket: TicketWithRelations | Ticket,
  relationKey: TicketRelationKey,
  relatedTicket: TicketRelation,
  action: 'add' | 'remove'
): TicketWithRelations {
  const nextTicket = {
    ...ticket,
    [relationKey]:
      action === 'add'
        ? addTicketRelation(ticket[relationKey], relatedTicket)
        : removeTicketRelation(ticket[relationKey], relatedTicket.id),
  };

  const blockedTicket = relationKey === 'blockers'
    ? nextTicket.blockers?.[0] ?? null
    : nextTicket.blockedTicket ?? null;

  const isBlocked = Boolean(nextTicket.blockers && nextTicket.blockers.length > 0);
  const isDependency = Boolean(nextTicket.dependencies && nextTicket.dependencies.length > 0);

  return {
    ...nextTicket,
    isBlocked,
    isDependency,
    blockedTicket,
    relatedTicketIds: collectRelatedTicketIds({
      dependencies: nextTicket.dependencies,
      blockers: nextTicket.blockers,
      blockedTicket,
    }),
  };
}

export function isDuplicateTicketRelationError(error: unknown) {
  return error instanceof Error && error.message.startsWith('This ticket already ');
}
