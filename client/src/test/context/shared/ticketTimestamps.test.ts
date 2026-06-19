import { describe, expect, it } from 'vitest';
import {
  parseTimestamp,
  shouldAcceptSseTicketUpdate,
  shouldAcceptSseCommentUpdate,
} from '../../../context/shared/ticketTimestamps';
import type { Ticket, Comment } from '../../../types/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_ISO = '2026-01-01T00:00:00.000Z';
const NEWER_ISO = '2026-06-01T00:00:00.000Z';
const OLDER_ISO = '2025-01-01T00:00:00.000Z';

function makeTicket(updatedAt: string): Ticket {
  return {
    id: 'ticket-1',
    key: 'GRA-1',
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    projectId: 'project-1',
    domainId: null,
    cycleId: null,
    parentId: null,
    prStatus: 'none',
    prUrl: null,
    createdAt: BASE_ISO,
    updatedAt,
  };
}

function makeComment(updatedAt?: string, createdAt: string = BASE_ISO): Comment {
  return {
    id: 'comment-1',
    ticketId: 'ticket-1',
    userId: 'user-1',
    body: 'Hello',
    createdAt,
    updatedAt,
  };
}

// ---------------------------------------------------------------------------
// parseTimestamp
// ---------------------------------------------------------------------------

describe('parseTimestamp', () => {
  it('parses a valid ISO string', () => {
    const result = parseTimestamp(BASE_ISO);
    expect(typeof result).toBe('number');
    expect(result).toBe(Date.parse(BASE_ISO));
  });

  it('returns undefined for non-string input', () => {
    expect(parseTimestamp(null)).toBeUndefined();
    expect(parseTimestamp(undefined)).toBeUndefined();
    expect(parseTimestamp(12345)).toBeUndefined();
    expect(parseTimestamp({})).toBeUndefined();
  });

  it('returns undefined for invalid date strings', () => {
    expect(parseTimestamp('not-a-date')).toBeUndefined();
    expect(parseTimestamp('')).toBeUndefined();
    expect(parseTimestamp('0000-99-99')).toBeUndefined();
  });

  it('returns a numeric value for numeric-looking date strings', () => {
    const result = parseTimestamp('2026-06-19');
    expect(typeof result).toBe('number');
    expect(Number.isNaN(result)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldAcceptSseTicketUpdate
// ---------------------------------------------------------------------------

describe('shouldAcceptSseTicketUpdate', () => {
  it('accepts when there is no existing cached ticket', () => {
    const incoming = makeTicket(BASE_ISO);
    expect(shouldAcceptSseTicketUpdate(undefined, incoming)).toBe(true);
  });

  it('accepts when incoming is strictly newer', () => {
    const existing = makeTicket(BASE_ISO);
    const incoming = makeTicket(NEWER_ISO);
    expect(shouldAcceptSseTicketUpdate(existing, incoming)).toBe(true);
  });

  it('rejects when incoming is older than existing', () => {
    const existing = makeTicket(NEWER_ISO);
    const incoming = makeTicket(BASE_ISO);
    expect(shouldAcceptSseTicketUpdate(existing, incoming)).toBe(false);
  });

  it('rejects when incoming timestamp equals existing', () => {
    const existing = makeTicket(BASE_ISO);
    const incoming = makeTicket(BASE_ISO);
    expect(shouldAcceptSseTicketUpdate(existing, incoming)).toBe(false);
  });

  it('accepts when existing updatedAt is unparseable', () => {
    const existing = makeTicket('not-a-date');
    const incoming = makeTicket(BASE_ISO);
    expect(shouldAcceptSseTicketUpdate(existing, incoming)).toBe(true);
  });

  it('accepts when incoming updatedAt is unparseable (prefer liveness)', () => {
    const existing = makeTicket(BASE_ISO);
    const incoming = makeTicket('not-a-date');
    expect(shouldAcceptSseTicketUpdate(existing, incoming)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldAcceptSseCommentUpdate
// ---------------------------------------------------------------------------

describe('shouldAcceptSseCommentUpdate', () => {
  it('accepts when there is no existing cached comment', () => {
    const incoming = makeComment(BASE_ISO);
    expect(shouldAcceptSseCommentUpdate(undefined, incoming)).toBe(true);
  });

  it('accepts when incoming is strictly newer', () => {
    const existing = makeComment(BASE_ISO);
    const incoming = makeComment(NEWER_ISO);
    expect(shouldAcceptSseCommentUpdate(existing, incoming)).toBe(true);
  });

  it('rejects when incoming is older', () => {
    const existing = makeComment(NEWER_ISO);
    const incoming = makeComment(BASE_ISO);
    expect(shouldAcceptSseCommentUpdate(existing, incoming)).toBe(false);
  });

  it('rejects when incoming timestamp equals existing', () => {
    const existing = makeComment(BASE_ISO);
    const incoming = makeComment(BASE_ISO);
    expect(shouldAcceptSseCommentUpdate(existing, incoming)).toBe(false);
  });

  it('falls back to createdAt when updatedAt is absent on existing', () => {
    // existing has no updatedAt, uses createdAt = BASE_ISO
    const existing = makeComment(undefined, BASE_ISO);
    // incoming is newer
    const incoming = makeComment(NEWER_ISO, BASE_ISO);
    expect(shouldAcceptSseCommentUpdate(existing, incoming)).toBe(true);
  });

  it('falls back to createdAt when updatedAt is absent on incoming', () => {
    const existing = makeComment(NEWER_ISO, BASE_ISO);
    // incoming has no updatedAt, falls back to createdAt = OLDER_ISO
    const incoming = makeComment(undefined, OLDER_ISO);
    expect(shouldAcceptSseCommentUpdate(existing, incoming)).toBe(false);
  });

  it('accepts when both timestamps are unparseable', () => {
    const existing = makeComment('bad');
    const incoming = makeComment('also-bad');
    expect(shouldAcceptSseCommentUpdate(existing, incoming)).toBe(true);
  });
});
