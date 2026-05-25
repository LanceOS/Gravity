import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpRequestHandler } from '../src/mcp/request-handler.js';
import * as accessModule from '../src/mcp/access.js';
import * as workspaceToolsModule from '../src/mcp/workspace-tools.js';

describe('McpRequestHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a JSON-RPC error when tools/list infrastructure fails', async () => {
    vi.spyOn(accessModule, 'assertMcpWorkspaceAccess').mockResolvedValueOnce(undefined);
    vi.spyOn(workspaceToolsModule, 'getDisabledTools').mockRejectedValueOnce(new Error('Failed to load disabled tools.'));

    const handler = new McpRequestHandler();
    const response = await handler.handle(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          workspaceId: 'workspace-1',
        },
      } as never,
      'workspace-1',
      'user-1',
    );

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32603,
        message: 'Failed to load disabled tools.',
      },
    });
  });
});
