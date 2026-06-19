import type { Ticket } from '../../types/domain';
import { mergeTicketRelationSnapshot, type TicketWithRelations } from '../../modules/tickets/utils/ticketRelations';

/**
 * Extracts the `projectId` embedded in a React Query list query key.
 * Query keys for ticket lists follow the shape `[tag, { projectId }]`.
 * Returns `undefined` when the key does not match that shape.
 */
export function getListQueryProjectId(queryKey: unknown[]): string | undefined {
  const maybeMeta = queryKey[1];
  if (!maybeMeta || typeof maybeMeta !== 'object' || Array.isArray(maybeMeta)) {
    return undefined;
  }

  const meta = maybeMeta as { projectId?: unknown };
  return typeof meta.projectId === 'string' ? meta.projectId : undefined;
}

/**
 * Merges an incoming flat `Ticket` from SSE into the existing cached
 * `TicketWithRelations`, preserving relation data (dependencies, blockers,
 * subtasks) that the flat ticket payload omits.
 *
 * When `existing` is `undefined`, the incoming ticket is cast directly to
 * `TicketWithRelations` so callers receive a consistent return type.
 */
export function combineTicketDetails(
  existing: TicketWithRelations | undefined,
  incoming: Ticket,
): TicketWithRelations {
  if (!existing) {
    return incoming as TicketWithRelations;
  }

  return mergeTicketRelationSnapshot(existing, {
    ...existing,
    ...incoming,
  } as TicketWithRelations);
}

// ---------------------------------------------------------------------------
// Pure candidate-matching predicates used by findCachedTicketByKeyOrId
// (the full function lives in TicketContext because it closes over queryClient)
// ---------------------------------------------------------------------------

/**
 * Returns true when `candidate` is a valid ticket-like object whose `key`
 * matches `normalizedKey` (already upper-cased by the caller).
 */
export function candidateMatchesKey(
  candidate: unknown,
  normalizedKey: string,
): candidate is Ticket | TicketWithRelations {
  return (
    !!candidate &&
    typeof candidate === 'object' &&
    'id' in candidate &&
    'key' in candidate &&
    typeof (candidate as { key?: string }).key === 'string' &&
    (candidate as { key: string }).key === normalizedKey
  );
}

/**
 * Returns the first ticket in `list` that matches either `normalizedKey` or
 * `normalizedId`. Intended for scanning flat ticket arrays in the React Query
 * cache.
 */
export function findTicketInList(
  list: Ticket[],
  normalizedKey: string | undefined,
  normalizedId: string | undefined,
): Ticket | undefined {
  return list.find(
    (candidate) =>
      (normalizedKey ? candidate.key === normalizedKey : false) ||
      (normalizedId ? candidate.id === normalizedId : false),
  );
}

/**
 * Returns true when every compared field on `left` and `right` is identical.
 * Used to skip no-op cache writes after an SSE update.
 */
export function hasEquivalentTicketFields(left: Ticket, right: Ticket): boolean {
  return (
    left.id === right.id &&
    left.key === right.key &&
    left.title === right.title &&
    left.description === right.description &&
    left.status === right.status &&
    left.priority === right.priority &&
    left.projectId === right.projectId &&
    left.assigneeId === right.assigneeId &&
    left.cycleId === right.cycleId &&
    left.parentId === right.parentId &&
    left.isBlocked === right.isBlocked &&
    left.isDependency === right.isDependency &&
    left.prStatus === right.prStatus &&
    left.prUrl === right.prUrl &&
    left.branchName === right.branchName &&
    left.updatedAt === right.updatedAt
  );
}

/**
 * Returns a new list with the ticket identified by `ticketId` patched with
 * `updates`. Returns `undefined` when `list` is `undefined`, and a shallow
 * copy of the original list when the ticket is not found or the patch
 * produces no observable change.
 */
export function patchTicketInListById(
  list: readonly Ticket[] | undefined,
  ticketId: string,
  updates: Partial<Ticket>,
): Ticket[] | undefined {
  if (!list) {
    return undefined;
  }

  const index = list.findIndex((ticket) => ticket.id === ticketId);
  if (index === -1) {
    return [...list];
  }

  const existingTicket = list[index];
  const nextTicket: Ticket = {
    ...existingTicket,
    ...updates,
  };

  if (hasEquivalentTicketFields(existingTicket, nextTicket)) {
    return [...list];
  }

  const next = [...list];
  next[index] = nextTicket;
  return next;
}

