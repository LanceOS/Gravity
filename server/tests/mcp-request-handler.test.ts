import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpRequestHandler } from '../src/modules/mcp/request-handler.js';
import { bootstrapMcpRegistries } from '../src/modules/mcp/bootstrap.js';
import * as accessModule from '../src/modules/mcp/access.js';
import * as executorModule from '../src/modules/mcp/tool-executor.js';
import * as workspaceToolsModule from '../src/modules/mcp/workspace-tools.js';
import * as logger from '../src/lib/logger.js';

describe('McpRequestHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not expose tools/list infrastructure details in JSON-RPC errors', async () => {
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
        message: 'Internal error handling MCP request.',
      },
    });
  });

  it('does not expose unexpected tool execution details', async () => {
    bootstrapMcpRegistries();
    vi.spyOn(executorModule, 'executeTool').mockRejectedValueOnce(new Error('database password=secret was rejected'));
    const response = await new McpRequestHandler().handle({
      jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_projects', arguments: {} },
    }, 'workspace-1', 'user-1');
    expect(response).toMatchObject({ result: { isError: true, structuredContent: { error: {
      code: 'TOOL_EXECUTION_FAILED',
      message: 'Tool execution failed. Retry the call or contact support if it persists.',
    } } } });
    expect(JSON.stringify(response)).not.toContain('password=secret');
  });

  it('keeps the ticket creation rate limit actionable', async () => {
    bootstrapMcpRegistries();
    const message = 'Rate limit exceeded: You can only create one ticket every 3 seconds from this server instance. Please wait a moment and try again.';
    vi.spyOn(executorModule, 'executeTool').mockRejectedValueOnce(new Error(message));
    const response = await new McpRequestHandler().handle({
      jsonrpc: '2.0', id: 6, method: 'tools/call', params: {
        name: 'create_ticket', arguments: { projectId: 'project-1', title: 'Retry later' },
      },
    }, 'workspace-1', 'user-1');
    expect(response).toMatchObject({ result: { isError: true, structuredContent: { error: {
      code: 'RATE_LIMITED', message: 'Rate limit exceeded. Please wait a moment and try again.',
    } } } });
  });

  it('preserves actionable authorization errors from workspace access checks', async () => {
    vi.spyOn(accessModule, 'assertMcpWorkspaceAccess').mockRejectedValueOnce(new Error('Unauthorized workspace access.'));
    const response = await new McpRequestHandler().handle({
      jsonrpc: '2.0', id: 5, method: 'tools/list',
    }, 'workspace-1', 'user-1');
    expect(response).toMatchObject({ error: { code: -32001, message: 'Unauthorized workspace access.' } });
    expect(response).not.toHaveProperty('result');
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
        action: 'tools/call',
        workspaceId: 'workspace-1',
        toolName: 'get_ticket_details',
        requestedWorkspaceId: 'workspace-2',
      }),
    );
  });
});
