import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpStateMap, sanitize, desanitize, withMcpStateScope } from '../src/modules/mcp/state-map.js';

const projectId = 'p-11111111-1111-1111-1111-111111111111';
const ticketId = 'ti-22222222-2222-2222-2222-222222222222';

afterEach(() => { McpStateMap.clear(); vi.useRealTimers(); });

describe('scoped MCP references', () => {
  it('keeps stable IDs outside an explicitly authenticated scope', () => {
    expect(sanitize({ projectId })).toEqual({ projectId });
    expect(McpStateMap.getAllRealToTemp()).toEqual([]);
  });

  it('round trips IDs recursively and reuses references within a scope', () => withMcpStateScope('workspace:user', () => {
    const payload = { projectId, assigneeId: 'user-1', id: ticketId, tags: [projectId, 'bug'], text: `See ${projectId}` };
    const result = sanitize(payload);
    expect(result.projectId).toMatch(/^Temp-Project-[A-Z]+$/);
    expect(result.assigneeId).toMatch(/^Temp-User-[A-Z]+$/);
    expect(result.id).toMatch(/^Temp-Ticket-[A-Z]+$/);
    expect(result.tags[0]).toBe(result.projectId);
    expect(sanitize({ projectId }).projectId).toBe(result.projectId);
    expect(desanitize(result)).toEqual(payload);
    expect(desanitize('Temp-Unknown-A')).toBe('Temp-Unknown-A');
  }));

  it('never resolves one actor or workspace references in another scope', async () => {
    const first = withMcpStateScope('workspace-a:user-a', () => sanitize({ projectId }));
    for (const scope of ['workspace-a:user-b', 'workspace-b:user-a']) {
      await withMcpStateScope(scope, async () => {
        await Promise.resolve();
        expect(desanitize(first)).toEqual(first);
        expect(sanitize({ projectId }).projectId).not.toBe(first.projectId);
      });
    }
    expect(withMcpStateScope('workspace-a:user-a', () => desanitize(first))).toEqual({ projectId });
  });

  it('expires references without assigning old references to new resources', () => {
    vi.useFakeTimers();
    const first = withMcpStateScope('workspace:user', () => sanitize({ projectId }));
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    withMcpStateScope('workspace:user', () => {
      expect(desanitize(first)).toEqual(first);
      expect(sanitize({ projectId }).projectId).not.toBe(first.projectId);
    });
  });
});
