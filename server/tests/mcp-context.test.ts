import { describe, expect, it } from 'vitest';
import { resolveMcpContext } from '../src/modules/mcp/request-context.js';

describe('resolveMcpContext', () => {
  it('uses request workspace but ignores request actor without trusted context', () => {
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
      workspaceId: 'workspace-1',
      actorUserId: '',
    });
  });

  it('uses trusted actor context with request-provided workspace', () => {
    expect(
      resolveMcpContext(
        {
          method: 'tools/call',
          params: {
            workspaceId: 'workspace-from-request',
          },
        },
        {
          actorUserId: 'user-from-auth',
        },
      ),
    ).toEqual({
      workspaceId: 'workspace-from-request',
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
