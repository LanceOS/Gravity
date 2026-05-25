import { describe, expect, it } from 'vitest';
import { resolveMcpContext } from '../src/mcp/request-context.js';

describe('resolveMcpContext', () => {
  it('uses request params when no explicit context is provided', () => {
    expect(
      resolveMcpContext({
        method: 'tools/call',
        params: {
          workspaceId: 'workspace-1',
          actorUserId: 'user-1',
        },
      }),
    ).toEqual({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
    });
  });

  it('prefers explicit context over request-provided values', () => {
    expect(
      resolveMcpContext(
        {
          method: 'tools/call',
          params: {
            workspaceId: 'workspace-from-request',
            actorUserId: 'user-from-request',
          },
        },
        {
          workspaceId: 'workspace-from-auth',
          actorUserId: 'user-from-auth',
        },
      ),
    ).toEqual({
      workspaceId: 'workspace-from-auth',
      actorUserId: 'user-from-auth',
    });
  });
});
