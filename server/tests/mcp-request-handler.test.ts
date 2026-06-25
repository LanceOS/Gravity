import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpRequestHandler } from '../src/modules/mcp/request-handler.js';
import * as accessModule from '../src/modules/mcp/access.js';
import * as workspaceToolsModule from '../src/modules/mcp/workspace-tools.js';
import * as logger from '../src/lib/logger.js';

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

  it('skips the duplicate access check when the caller already validated access', async () => {
    const accessSpy = vi.spyOn(accessModule, 'assertMcpWorkspaceAccess');
    vi.spyOn(workspaceToolsModule, 'getDisabledTools').mockResolvedValueOnce([]);

    const handler = new McpRequestHandler();
    const response = await handler.handle(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {
          workspaceId: 'workspace-1',
        },
      } as never,
      'workspace-1',
      'user-1',
      {
        accessChecked: true,
      },
    );

    expect(accessSpy).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: {
        tools: expect.any(Array),
      },
    });
  });

  it('rejects tool calls where payload workspaceId does not match scoped workspace', async () => {
    const auditSpy = vi.spyOn(logger, 'audit').mockImplementation(() => {});

    const handler = new McpRequestHandler();
    const response = await handler.handle(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_ticket_details',
          workspaceId: 'workspace-2',
          arguments: {
            ticketKey: 'SCP-1',
          },
        },
      } as never,
      'workspace-1',
      'user-1',
    );

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      error: {
        code: -32602,
        message: 'This action is scoped to workspace workspace-1 and cannot be performed on resources in other workspaces.',
      },
    });

    expect(auditSpy).toHaveBeenCalledWith(
      'mcp.scope.violation',
      expect.objectContaining({
        action: 'mcp_scope_violation',
        workspaceId: 'workspace-1',
        toolName: 'get_ticket_details',
        requestedWorkspaceId: 'workspace-2',
      }),
    );
  });
});
