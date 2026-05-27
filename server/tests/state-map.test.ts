import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpStateMap, sanitize, desanitize } from '../src/modules/mcp/state-map.js';

describe('McpStateMap & Sanitization Flow', () => {
  beforeEach(() => {
    McpStateMap.clear();
  });

  afterEach(() => {
    McpStateMap.clear();
  });

  it('correctly maps raw database UUIDs and entity IDs bidirectionally with letter codes', () => {
    const rawProjId = 'p-12345678-1234-1234-1234-1234567890ab';
    const rawTickId = 'ti-abcdef01-abcd-abcd-abcd-abcdef012345';

    const tempProjId = McpStateMap.getOrCreateTempId(rawProjId, 'Project');
    const tempTickId = McpStateMap.getOrCreateTempId(rawTickId, 'Ticket');

    expect(tempProjId).toBe('Temp-Project-A');
    expect(tempTickId).toBe('Temp-Ticket-A');

    // Retrieve again to verify idempotent retrieval
    expect(McpStateMap.getOrCreateTempId(rawProjId, 'Project')).toBe('Temp-Project-A');

    // Generate another project to verify letter index increments
    const rawProjId2 = 'p-87654321-4321-4321-4321-210987654321';
    const tempProjId2 = McpStateMap.getOrCreateTempId(rawProjId2, 'Project');
    expect(tempProjId2).toBe('Temp-Project-B');

    // Test reverse lookup
    expect(McpStateMap.getRealId('Temp-Project-A')).toBe(rawProjId);
    expect(McpStateMap.getRealId('Temp-Ticket-A')).toBe(rawTickId);
    expect(McpStateMap.getRealId('Temp-Project-B')).toBe(rawProjId2);
    expect(McpStateMap.getRealId('Temp-Unknown-A')).toBeUndefined();
  });

  it('sanitizes strings containing raw UUIDs, Gravity prefixed IDs, and specific key patterns', () => {
    const rawProjId = 'p-eeebd7ff-cb2e-4e5f-a014-0ef1251160a5';
    const rawUserId = 'google-oauth2|99998888';
    const commentBodyText = `Hello! Please check out project p-eeebd7ff-cb2e-4e5f-a014-0ef1251160a5 and see if it works.`;

    const payload = {
      id: 'ti-1a2b3c4d-1234-1234-1234-1234567890ab',
      title: 'Verify OAuth Login and Project Settings',
      projectId: rawProjId,
      assigneeId: rawUserId,
      metadata: {
        creatorId: 'user-7777', // generic special key candidate
        textContext: commentBodyText,
      },
      tags: ['bug', 'high-priority', rawProjId],
    };

    const sanitized = sanitize(payload);

    // Verify raw values replaced with state map references
    expect(sanitized.projectId).toBe('Temp-Project-A');
    expect(sanitized.assigneeId).toBe('Temp-User-A');
    expect(sanitized.id).toBe('Temp-Ticket-A');
    expect(sanitized.metadata.creatorId).toBe('user-7777');

    // Substring replacements inside text context
    expect(sanitized.metadata.textContext).toBe(
      'Hello! Please check out project Temp-Project-A and see if it works.'
    );

    // Array items also sanitized recursively
    expect(sanitized.tags).toContain('Temp-Project-A');
    expect(sanitized.tags).toContain('bug');
  });

  it('correctly uses parent heuristics when sanitizing generic fields like "id"', () => {
    const rawId = '88888888-4444-4444-4444-121212121212';

    const projectPayload = {
      projectKey: 'GRA',
      projectName: 'Gravity Core',
      id: rawId,
    };

    const ticketPayload = {
      ticketKey: 'GRA-123',
      title: 'Fix issue',
      id: rawId, // same raw ID in different object to test mapping cache reuse
    };

    const sanitizedProject = sanitize(projectPayload);
    expect(sanitizedProject.id).toBe('Temp-Project-A');

    // Clean map to test ticket-specific heuristic alone
    McpStateMap.clear();
    const sanitizedTicket = sanitize(ticketPayload);
    expect(sanitizedTicket.id).toBe('Temp-Ticket-A');
  });

  it('desanitizes/translates temporary references back to raw database IDs recursively', () => {
    const rawProjId = 'p-eeebd7ff-cb2e-4e5f-a014-0ef1251160a5';
    const rawUserId = 'google-oauth2|99998888';

    // Populate the state map
    McpStateMap.getOrCreateTempId(rawProjId, 'Project');
    McpStateMap.getOrCreateTempId(rawUserId, 'User');

    const inputArgs = {
      projectId: 'Temp-Project-A',
      assigneeId: 'Temp-User-A',
      ticketDescription: 'Please assign this to Temp-User-A inside project Temp-Project-A.',
      nested: {
        projectRef: 'Temp-Project-A',
        unmapped: 'Temp-Project-B', // unmapped reference should be left untouched
      },
    };

    const desanitized = desanitize(inputArgs);

    expect(desanitized.projectId).toBe(rawProjId);
    expect(desanitized.assigneeId).toBe(rawUserId);
    expect(desanitized.ticketDescription).toBe(
      `Please assign this to ${rawUserId} inside project ${rawProjId}.`
    );
    expect(desanitized.nested.projectRef).toBe(rawProjId);
    expect(desanitized.nested.unmapped).toBe('Temp-Project-B');
  });
});
