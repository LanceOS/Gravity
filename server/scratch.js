import { handleMcpRequest } from './src/mcp.js';

export async function runScratchRequest(workspaceId, actorUserId) {
  return handleMcpRequest({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'list_workspace_members',
      arguments: { workspaceId },
    },
  }, workspaceId, actorUserId);
}
