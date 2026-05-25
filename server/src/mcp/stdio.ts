import readline from 'node:readline';
import { initializeDatabase } from '../db/bootstrap.js';
import { env } from '../env.js';
import { handleMcpRequest } from './request-handler.js';
import { getMcpStdioContext } from './stdio-config.js';

/**
 * Runs the MCP server over stdio using a single trusted workspace and actor
 * identity resolved at startup.
 */
export class McpStdioServer {
  async start() {
    // Stdio never trusts per-request identity, so startup fails if the env is incomplete.
    const context = getMcpStdioContext(env);

    await initializeDatabase();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    console.error('Gravity MCP Stdio Server running...');

    rl.on('line', async (line: string) => {
      if (!line.trim()) {
        return;
      }

      try {
        const request = JSON.parse(line);
        const response = await handleMcpRequest(request, context.workspaceId, context.actorUserId);
        console.log(JSON.stringify(response));
      } catch (error) {
        // Malformed stdin input is surfaced as a JSON-RPC parse error to the client.
        console.error(error instanceof Error ? error.message : error);
        console.log(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          }),
        );
      }
    });
  }
}

/**
 * Starts the standalone stdio entry point used by local MCP clients.
 */
async function main() {
  const server = new McpStdioServer();
  await server.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
