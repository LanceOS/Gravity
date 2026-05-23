import { handleMcpRequest } from './src/mcp.js';

const workspaceId = 'ws1';
const actorUserId = 'debug-user';

console.log(await handleMcpRequest({
  jsonrpc: '2.0',
  id: 5,
  method: 'tools/call',
  params: {
    name: 'list_workspace_members',
    arguments: { workspaceId },
  },
}, workspaceId, actorUserId));
