import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function data(result: any): any {
  expect(result.isError).not.toBe(true);
  return result.structuredContent.data;
}

describe('official MCP SDK stdio interoperability', () => {
  it('initializes, discovers, reads, creates and reads a ticket with audit output only on stderr', { timeout: 20_000 }, async () => {
    const client = new Client({ name: 'gravity-stdio-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', fileURLToPath(new URL('./fixtures/mcp-stdio-server.ts', import.meta.url))],
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        DATABASE_URL: 'pgmem://stdio-interoperability', NODE_ENV: 'test', REDIS_ENABLED: 'false',
        BETTER_AUTH_SECRET: 'test-stdio-secret-12345678901234567890',
        BETTER_AUTH_BASE_URL: 'http://localhost:8080',
        MCP_STDIO_WORKSPACE_ID: 'stdio-workspace', MCP_STDIO_ACTOR_USER_ID: 'stdio-user',
      },
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    const errors: Error[] = [];
    client.onerror = (error) => errors.push(error);
    try {
      await client.connect(transport);
      await client.ping();
      const catalog = await client.listTools();
      expect(catalog.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(['create_ticket', 'get_ticket', 'list_projects']));
      expect(data(await client.callTool({ name: 'list_tickets', arguments: { projectId: 'stdio-project' } }))).toEqual([]);
      const created = data(await client.callTool({ name: 'create_ticket', arguments: { projectId: 'stdio-project', title: 'Created through standard stdio' } }));
      const read = data(await client.callTool({ name: 'get_ticket', arguments: { ticketKey: created.ticket.key } }));
      expect(read.title).toBe('Created through standard stdio');
      expect(errors).toEqual([]);
      expect(stderr).toContain('mcp.tool_execute');
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nServer stderr: ${stderr}`);
    } finally {
      await client.close();
    }
  });
});
