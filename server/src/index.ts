import { createServer } from 'node:http';
import { createApp } from './app.js';
import { initializeDatabase } from './db/bootstrap.js';
import { env } from './env.js';
import { start as startServiceTokens } from './lib/serviceTokens.js';
import { McpStdioServer } from './modules/mcp/stdio.js';
import { McpStdioSession } from './modules/mcp/stdio-session.js';

async function main() {
  await initializeDatabase();

  // Initialize trusted service tokens and start periodic refresh.
  // This is explicit so importing the module has no side-effects.
  await startServiceTokens();

  const app = createApp();
  const server = createServer(app);

  server.listen(env.port, () => {
    console.log(`gravity-server listening on ${env.port}`);
  });

  // NOTE: Do not start the MCP stdio transport in the main HTTP server process.
  // MCP stdio requires exclusive use of stdout for JSON-RPC responses, but the
  // API server logs to stdout.
  // Run `server/src/modules/mcp/stdio.ts` as a separate process when stdio is needed.

  // Optionally spawn a configured agent command and attach it via stdio.
  if (env.mcpAgentCommand && env.mcpStdioWorkspaceId && env.mcpStdioActorUserId) {
    try {
      const { spawn } = await import('node:child_process');
      const child = spawn(env.mcpAgentCommand, { shell: true, stdio: ['pipe', 'pipe', 'inherit'] });
      const session = new McpStdioSession(child.stdout, child.stdin, {
        workspaceId: env.mcpStdioWorkspaceId,
        actorUserId: env.mcpStdioActorUserId,
        allowHandshake: false,
      });
      session.start();
      child.on('exit', (code) => console.log(`Agent process exited: ${code}`));
      console.log('Spawned configured MCP agent via stdio.');
    } catch (err) {
      console.error('Failed to spawn MCP agent command:', err);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});