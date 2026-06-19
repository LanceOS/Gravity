import type { Ticket, Comment } from '../../types/domain';

/**
 * Parses an ISO timestamp string into a numeric millisecond value.
 * Returns `undefined` when the value is not a parseable string.
 */
export function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

/**
 * Returns true when an incoming SSE ticket should replace the cached one.
 * An update is accepted when:
 * - There is no existing cached entry (always accept), OR
 * - Either timestamp is missing/unparseable (accept, prefer liveness), OR
 * - The incoming `updatedAt` is strictly newer than the existing one.
 */
export function shouldAcceptSseTicketUpdate(existing: Ticket | undefined, incoming: Ticket): boolean {
  if (!existing) return true;

  const existingUpdatedAt = parseTimestamp(existing.updatedAt);
  const incomingUpdatedAt = parseTimestamp(incoming.updatedAt);

  if (!incomingUpdatedAt || !existingUpdatedAt) {
    return true;
  }

  return incomingUpdatedAt > existingUpdatedAt;
}

/**
 * Returns true when an incoming SSE comment should replace the cached one.
 * Falls back to `createdAt` when `updatedAt` is absent, mirroring the
 * `Comment` type where `updatedAt` is optional.
 */
export function shouldAcceptSseCommentUpdate(existing: Comment | undefined, incoming: Comment): boolean {
  if (!existing) return true;

  const existingUpdatedAt = parseTimestamp(existing.updatedAt ?? existing.createdAt);
  const incomingUpdatedAt = parseTimestamp(incoming.updatedAt ?? incoming.createdAt);

  if (!incomingUpdatedAt || !existingUpdatedAt) {
    return true;
  }

  return incomingUpdatedAt > existingUpdatedAt;
}
