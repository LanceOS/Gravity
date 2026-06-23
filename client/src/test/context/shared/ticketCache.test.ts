import { describe, expect, it } from 'vitest';
import {
  getListQueryProjectId,
  combineTicketDetails,
  candidateMatchesKey,
  findTicketInList,
  hasEquivalentTicketFields,
  patchTicketInListById,
} from '../../../context/shared/ticketCache';
import type { Ticket } from '../../../types/domain';
import type { TicketWithRelations } from '../../../modules/tickets/utils/ticketRelations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    key: 'GRA-1',
    title: 'Test ticket',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTicketWithRelations(overrides: Partial<TicketWithRelations> = {}): TicketWithRelations {
  return {
    ...makeTicket(),
    relatedTicketIds: [],
    dependencies: [],
    blockers: [],
    blockedTicket: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getListQueryProjectId
// ---------------------------------------------------------------------------

describe('getListQueryProjectId', () => {
  it('returns the projectId from a valid query key', () => {
    const queryKey = ['tickets', { projectId: 'project-42' }];
    expect(getListQueryProjectId(queryKey)).toBe('project-42');
  });

  it('returns undefined when the second element is missing', () => {
    expect(getListQueryProjectId(['tickets'])).toBeUndefined();
  });

  it('returns undefined when the second element is not an object', () => {
    expect(getListQueryProjectId(['tickets', 'not-an-object'])).toBeUndefined();
    expect(getListQueryProjectId(['tickets', null])).toBeUndefined();
    expect(getListQueryProjectId(['tickets', 42])).toBeUndefined();
  });

  it('returns undefined when the second element is an array', () => {
    expect(getListQueryProjectId(['tickets', []])).toBeUndefined();
  });

  it('returns undefined when projectId is not a string', () => {
    expect(getListQueryProjectId(['tickets', { projectId: 42 }])).toBeUndefined();
    expect(getListQueryProjectId(['tickets', { projectId: null }])).toBeUndefined();
    expect(getListQueryProjectId(['tickets', {}])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// combineTicketDetails
// ---------------------------------------------------------------------------

describe('combineTicketDetails', () => {
  it('returns the incoming ticket cast to TicketWithRelations when existing is undefined', () => {
    const incoming = makeTicket({ title: 'Fresh ticket' });
    const result = combineTicketDetails(undefined, incoming);
    expect(result.id).toBe(incoming.id);
    expect(result.title).toBe('Fresh ticket');
  });

  it('merges scalar fields from incoming over existing', () => {
    const existing = makeTicketWithRelations({ title: 'Old title', status: 'todo' });
    const incoming = makeTicket({ title: 'New title', status: 'done', updatedAt: '2026-06-01T00:00:00.000Z' });
    const result = combineTicketDetails(existing, incoming);
    expect(result.title).toBe('New title');
    expect(result.status).toBe('done');
  });

  it('preserves existing relation data not in the incoming flat ticket', () => {
    const dependency = { id: 'dep-1', key: 'GRA-2', title: 'Dep ticket', projectId: 'project-1' };
    const blocker = { id: 'blk-1', key: 'GRA-3', title: 'Blocker', projectId: 'project-1' };
    const existing = makeTicketWithRelations({
      dependencies: [dependency],
      blockers: [blocker],
      relatedTicketIds: ['dep-1', 'blk-1'],
    });
    const incoming = makeTicket({ title: 'Updated title' });
    const result = combineTicketDetails(existing, incoming);
    // relation data preserved from existing
    expect(result.dependencies).toEqual([dependency]);
    expect(result.blockers).toEqual([blocker]);
  });

  it('uses incoming relation data when incoming has it', () => {
    const existing = makeTicketWithRelations({
      dependencies: [{ id: 'old-dep', key: 'GRA-0', title: 'Old dep', projectId: 'project-1' }],
    });
    const newDep = { id: 'new-dep', key: 'GRA-9', title: 'New dep', projectId: 'project-1' };
    const incoming = makeTicket({ dependencies: [newDep] });
    const result = combineTicketDetails(existing, incoming);
    expect(result.dependencies).toEqual([newDep]);
  });

  it('clears stale relation arrays when incoming flags explicitly say the ticket is no longer blocked or blocking', () => {
    const existing = makeTicketWithRelations({
      dependencies: [{ id: 'dep-1', key: 'GRA-2', title: 'Dependency', projectId: 'project-1' }],
      blockers: [{ id: 'blk-1', key: 'GRA-3', title: 'Blocker', projectId: 'project-1' }],
      blockedTicket: { id: 'blk-1', key: 'GRA-3', title: 'Blocker', projectId: 'project-1' },
      isBlocked: true,
      isDependency: true,
      relatedTicketIds: ['dep-1', 'blk-1'],
    });
    const incoming = makeTicket({
      isBlocked: false,
      isDependency: false,
    });
    const result = combineTicketDetails(existing, incoming);

    expect(result.dependencies).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.blockedTicket).toBeNull();
    expect(result.relatedTicketIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// candidateMatchesKey
// ---------------------------------------------------------------------------

describe('candidateMatchesKey', () => {
  it('returns true when candidate has matching key', () => {
    const candidate = { id: 'id-1', key: 'GRA-1', title: 'T' };
    expect(candidateMatchesKey(candidate, 'GRA-1')).toBe(true);
  });

  it('returns false when key does not match', () => {
    const candidate = { id: 'id-1', key: 'GRA-2', title: 'T' };
    expect(candidateMatchesKey(candidate, 'GRA-1')).toBe(false);
  });

  it('returns false for null', () => {
    expect(candidateMatchesKey(null, 'GRA-1')).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(candidateMatchesKey('string', 'GRA-1')).toBe(false);
    expect(candidateMatchesKey(42, 'GRA-1')).toBe(false);
  });

  it('returns false when key property is missing', () => {
    expect(candidateMatchesKey({ id: 'id-1' }, 'GRA-1')).toBe(false);
  });

  it('returns false when key is not a string', () => {
    expect(candidateMatchesKey({ id: 'id-1', key: 42 }, 'GRA-1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findTicketInList
// ---------------------------------------------------------------------------

describe('findTicketInList', () => {
  const tickets: Ticket[] = [
    makeTicket({ id: 'ticket-1', key: 'GRA-1' }),
    makeTicket({ id: 'ticket-2', key: 'GRA-2' }),
  ];

  it('finds a ticket by key', () => {
    const result = findTicketInList(tickets, 'GRA-1', undefined);
    expect(result?.id).toBe('ticket-1');
  });

  it('finds a ticket by id', () => {
    const result = findTicketInList(tickets, undefined, 'ticket-2');
    expect(result?.id).toBe('ticket-2');
  });

  it('returns undefined when neither matches', () => {
    const result = findTicketInList(tickets, 'GRA-99', 'nonexistent-id');
    expect(result).toBeUndefined();
  });

  it('returns undefined when list is empty', () => {
    const result = findTicketInList([], 'GRA-1', 'ticket-1');
    expect(result).toBeUndefined();
  });

  it('returns undefined when both key and id are undefined', () => {
    const result = findTicketInList(tickets, undefined, undefined);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hasEquivalentTicketFields
// ---------------------------------------------------------------------------

describe('hasEquivalentTicketFields', () => {
  const baseTicket = makeTicket({
    id: 't1',
    key: 'GRA-1',
    title: 'A',
    description: 'B',
    status: 'todo',
    priority: 'high',
    projectId: 'p1',
    assigneeId: 'u1',
    cycleId: 'c1',
    parentId: 't0',
    isBlocked: false,
    isDependency: true,
    prStatus: 'open',
    prUrl: 'http://pr',
    branchName: 'main',
    updatedAt: '2026-06-01',
  });

  it('returns true when all fields match', () => {
    expect(hasEquivalentTicketFields(baseTicket, { ...baseTicket })).toBe(true);
  });

  it('returns false when a field differs', () => {
    expect(hasEquivalentTicketFields(baseTicket, { ...baseTicket, status: 'in_progress' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// patchTicketInListById
// ---------------------------------------------------------------------------

describe('patchTicketInListById', () => {
  const t1 = makeTicket({ id: 't1', title: 'T1', status: 'todo' });
  const t2 = makeTicket({ id: 't2', title: 'T2', status: 'done' });
  const list = [t1, t2];

  it('returns undefined if list is undefined', () => {
    expect(patchTicketInListById(undefined, 't1', { title: 'New' })).toBeUndefined();
  });

  it('returns shallow copy if ticket not found', () => {
    const result = patchTicketInListById(list, 't99', { title: 'New' });
    expect(result).toEqual(list);
    expect(result).not.toBe(list);
  });

  it('returns shallow copy if no fields changed', () => {
    const result = patchTicketInListById(list, 't1', { title: 'T1' });
    expect(result).toEqual(list);
    expect(result).not.toBe(list);
  });

  it('returns new list with updated ticket', () => {
    const result = patchTicketInListById(list, 't1', { title: 'New T1' });
    expect(result).toBeDefined();
    if (result) {
      expect(result[0].title).toBe('New T1');
      expect(result[1]).toBe(t2);
    }
  });
});
