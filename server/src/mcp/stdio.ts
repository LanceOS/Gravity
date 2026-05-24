import readline from 'node:readline';
import { initializeDatabase } from '../db/bootstrap.js';
import { handleMcpRequest } from './request-handler.js';

export class McpStdioServer {
  async start() {
    await initializeDatabase();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    console.error('Gravity MCP Stdio Server running...');

    rl.on('line', async (line) => {
      if (!line.trim()) {
        return;
      }

      try {
        const request = JSON.parse(line);
        const response = await handleMcpRequest(request);
        console.log(JSON.stringify(response));
      } catch (error) {
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

async function main() {
  const server = new McpStdioServer();
  await server.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
