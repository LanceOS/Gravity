import { initializeDatabase } from '../../db/bootstrap.js';
import { env } from '../../env.js';
import { getMcpStdioContext } from './stdio-config.js';
import { McpStdioSession } from './stdio-session.js';

/**
 * @description Runs the MCP server over stdio using a single trusted workspace
 * and actor identity resolved at startup.
 */
export class McpStdioServer {
  /**
   * @description Starts the stdio transport and listens for one JSON-RPC
   * request per input line.
   * @param opts.startWithDb When true the server will initialize the database
   * before installing the listener. When false the caller is responsible for
   * ensuring the DB is initialized.
   * @return Resolves once the stdio listener has been installed.
   */
  async start(opts: { initDb?: boolean } = {}) {
    // Stdio never trusts per-request identity, so startup fails if the env is incomplete.
    const context = getMcpStdioContext(env);

    if (opts.initDb) {
      await initializeDatabase();
    }

    const session = new McpStdioSession(process.stdin, process.stdout, {
      workspaceId: context.workspaceId,
      actorUserId: context.actorUserId,
      allowHandshake: false,
    });

    session.start();

    console.error('Gravity MCP Stdio Server running...');
  }
}

/**
 * @description Starts the standalone stdio entry point used by local MCP
 * clients.
 * @return Resolves once the stdio server has started.
 */
async function main() {
  const server = new McpStdioServer();
  await server.start({ initDb: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
