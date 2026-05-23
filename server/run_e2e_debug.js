import request from 'supertest';
import { createApp } from './src/app.js';
import { seedWorkspaceFixture } from './tests/helpers/test-helpers.js';

async function run() {
  const { owner, project } = await seedWorkspaceFixture();
  const agent = request.agent(createApp());
  const mcpHeaders = {
    'x-user-id': owner.id,
    'X-Workspace-Id': project.workspaceId,
  };

  const init = await agent
    .post('/api/v1/mcp/sse')
    .set(mcpHeaders)
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });

  const listMembersResponse = await agent
    .post('/api/v1/mcp/sse')
    .set(mcpHeaders)
    .send({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'list_workspace_members',
        arguments: {},
      },
    });
  console.log('List members response status:', listMembersResponse.status);
  console.log('List members response body:', JSON.stringify(listMembersResponse.body, null, 2));
}

run().catch(console.error);
