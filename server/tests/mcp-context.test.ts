import { describe, expect, it } from 'vitest';
import { resolveMcpContext } from '../src/modules/mcp/request-context.js';

describe('resolveMcpContext', () => {
  it('uses trusted context and ignores request values when no trusted context is provided', () => {
    expect(
      resolveMcpContext(
        {
          method: 'tools/call',
          params: {
            workspaceId: 'workspace-1',
            actorUserId: 'user-1',
          },
        } as never,
      ),
    ).toEqual({
      workspaceId: '',
      actorUserId: '',
    });
  });

  it('uses trusted context even when request provides workspace and actor', () => {
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
          actorUserId: 'user-from-auth',
          workspaceId: 'workspace-from-auth',
        },
      ),
    ).toEqual({
      workspaceId: 'workspace-from-auth',
      actorUserId: 'user-from-auth',
    });
  });

  it('prefers explicit context over request-provided workspace', () => {
    expect(
      resolveMcpContext(
        {
          method: 'tools/call',
          params: {
            workspaceId: 'workspace-from-request',
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
