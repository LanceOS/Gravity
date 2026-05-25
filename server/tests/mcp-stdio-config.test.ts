import { describe, expect, it } from 'vitest';
import { getMcpStdioContext } from '../src/mcp/stdio-config.js';

describe('getMcpStdioContext', () => {
  it('throws when the stdio workspace id is missing', () => {
    expect(() =>
      getMcpStdioContext({
        mcpStdioActorUserId: 'user-1',
      }),
    ).toThrow('MCP stdio requires MCP_STDIO_WORKSPACE_ID.');
  });

  it('throws when the stdio actor id is missing', () => {
    expect(() =>
      getMcpStdioContext({
        mcpStdioWorkspaceId: 'workspace-1',
      }),
    ).toThrow('MCP stdio requires MCP_STDIO_ACTOR_USER_ID.');
  });

  it('returns the trusted stdio context when both values are configured', () => {
    expect(
      getMcpStdioContext({
        mcpStdioWorkspaceId: ' workspace-1 ',
        mcpStdioActorUserId: ' user-1 ',
      }),
    ).toEqual({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
    });
  });
});
