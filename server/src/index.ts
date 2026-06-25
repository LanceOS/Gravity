import { createServer } from 'node:http';
import { createApp } from './app.js';
import { initializeDatabase } from './db/bootstrap.js';
import { env } from './env.js';
import { start as startServiceTokens, stopAutoRefresh } from './lib/serviceTokens.js';
import { McpStdioSession } from './modules/mcp/stdio-session.js';
import type { ChildProcess } from 'node:child_process';

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

  // Graceful shutdown helpers
  let isShuttingDown = false;
  let mcpAgentChild: ChildProcess | null = null;
  let mcpAgentSession: McpStdioSession | null = null;
  let isStoppingMcpAgent = false;
  let mcpAgentRestartAttempts = 0;
  let mcpAgentRestartTimer: ReturnType<typeof setTimeout> | null = null;
  const MAX_MCP_AGENT_RESTART_ATTEMPTS = 3;
  const MCP_AGENT_RESTART_BASE_MS = 500;
  let mcpAgentProcessListeners:
    | null
    | {
        exit: (code: number | null, signal: NodeJS.Signals | null) => void;
        close: (code: number | null, signal: NodeJS.Signals | null) => void;
        processError: (error: Error) => void;
        stdoutError: (error: Error) => void;
        stdinError: (error: Error) => void;
        stderrError: (error: Error) => void;
        stdoutClose: () => void;
        stdinClose: () => void;
        stderrClose: () => void;
      } = null;

  const parseCommand = (command: string) => {
    const tokens = command.match(/(?:[^\s"']+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')+/g);
    if (!tokens || tokens.length === 0) return null;

    return {
      command: tokens[0].replace(/^["']|["']$/g, ''),
      args: tokens.slice(1).map((token) => token.replace(/^["']|["']$/g, '')),
    };
  };

  const clearMcpAgentRestartTimer = () => {
    if (mcpAgentRestartTimer) {
      clearTimeout(mcpAgentRestartTimer);
      mcpAgentRestartTimer = null;
    }
  };

  const scheduleMcpAgentRestart = (code: number | null, signal: NodeJS.Signals | null) => {
    if (isShuttingDown) return;

    if (mcpAgentRestartAttempts >= MAX_MCP_AGENT_RESTART_ATTEMPTS) {
      console.error(`MCP agent restart limit reached (${MAX_MCP_AGENT_RESTART_ATTEMPTS}). Giving up.`);
      return;
    }

    const attempt = ++mcpAgentRestartAttempts;
    const delay = Math.min(MCP_AGENT_RESTART_BASE_MS * Math.pow(2, attempt - 1), 30_000);

    clearMcpAgentRestartTimer();
    mcpAgentRestartTimer = setTimeout(() => {
      mcpAgentRestartAttempts = 0;
      mcpAgentRestartTimer = null;
      void startMcpAgent();
    }, delay);
    if (typeof mcpAgentRestartTimer.unref === 'function') mcpAgentRestartTimer.unref();
    console.error(
      `MCP agent exited unexpectedly (code=${code}, signal=${signal}). Restarting attempt ${attempt}/${MAX_MCP_AGENT_RESTART_ATTEMPTS} in ${delay}ms.`
    );
  };

  const stopMcpAgent = async (options: { restart?: boolean } = {}) => {
    if (isStoppingMcpAgent) return;

    const child = mcpAgentChild;
    const session = mcpAgentSession;
    const listeners = mcpAgentProcessListeners;
    const shouldRestart = options.restart && !isShuttingDown;

    if (!child && !session) {
      if (shouldRestart) {
        scheduleMcpAgentRestart(null, null);
      }
      return;
    }

    isStoppingMcpAgent = true;
    mcpAgentChild = null;
    mcpAgentSession = null;
    mcpAgentProcessListeners = null;
    clearMcpAgentRestartTimer();

    try {
      if (session) {
        try {
          await session.stop();
        } catch (error) {
          console.error('Error stopping MCP session:', error);
        }
      }

      if (child && listeners) {
        child.off('exit', listeners.exit);
        child.off('close', listeners.close);
        child.off('error', listeners.processError);

        if (child.stdout) {
          child.stdout.off('error', listeners.stdoutError);
          child.stdout.off('close', listeners.stdoutClose);
        }
        if (child.stdin) {
          child.stdin.off('error', listeners.stdinError);
          child.stdin.off('close', listeners.stdinClose);
        }
        if (child.stderr) {
          child.stderr.off('error', listeners.stderrError);
          child.stderr.off('close', listeners.stderrClose);
        }
      }

      if (!child) return;

      await new Promise<void>((resolve) => {
        let settled = false;

        const finalize = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        if (child.exitCode !== null || child.signalCode !== null) {
          console.log(`MCP agent process already exited: code=${child.exitCode}, signal=${child.signalCode}`);
          finalize();
          return;
        }

        const timeout = setTimeout(() => {
          if (!child.killed) {
            try {
              child.kill('SIGKILL');
            } catch (error) {
              console.error('Error force-killing MCP agent process:', error);
            }
          }
          finalize();
        }, 2_000);

        if (typeof timeout.unref === 'function') timeout.unref();

        const finalizeShutdown = (code: number | null, signal: NodeJS.Signals | null) => {
          clearTimeout(timeout);
          console.log(`MCP agent process exited: code=${code}, signal=${signal}`);
          finalize();
        };

        child.once('exit', finalizeShutdown);
        child.once('close', finalizeShutdown);
        child.once('error', (error) => {
          clearTimeout(timeout);
          console.error('MCP agent process error during shutdown:', error);
          finalize();
        });

        try {
          child.stdin?.end();
        } catch (error) {
          console.error('Error ending MCP agent stdin:', error);
        }

        try {
          child.stdout?.destroy();
          child.stderr?.destroy();
        } catch (error) {
          console.error('Error destroying MCP agent streams:', error);
        }

        try {
          child.kill('SIGTERM');
        } catch (error) {
          console.error('Error stopping MCP agent process:', error);
          finalize();
        }
      });
    } finally {
      if (shouldRestart) {
        const code = child?.exitCode ?? null;
        const signal = child?.signalCode ?? null;
        scheduleMcpAgentRestart(code, signal);
      }
      isStoppingMcpAgent = false;
    }
  };

  const startMcpAgent = async () => {
    if (!env.mcpAgentCommand || !env.mcpStdioWorkspaceId || !env.mcpStdioActorUserId) return;
    if (isShuttingDown || isStoppingMcpAgent || mcpAgentChild || mcpAgentSession) return;

    try {
      const parsed = parseCommand(env.mcpAgentCommand);
      if (!parsed || !parsed.command) {
        console.error('Invalid MCP agent command.');
        throw new Error('Invalid MCP agent command format.');
      }

      clearMcpAgentRestartTimer();
      const { spawn } = await import('node:child_process');
      const child = spawn(parsed.command, parsed.args, {
        shell: false,
        stdio: ['pipe', 'pipe', 'inherit'],
      });
      mcpAgentChild = child;

      const handleAgentStreamError =
        (name: string) =>
        (error: Error) => {
          console.error(`MCP agent ${name} stream error:`, error);
          void stopMcpAgent({ restart: true });
        };
      const handleAgentStreamClose = (name: string) => () => {
        console.log(`MCP agent ${name} stream closed.`);
        void stopMcpAgent({ restart: false });
      };
      const isUnexpectedExit = (code: number | null, signal: NodeJS.Signals | null) =>
        (code !== 0 && code !== null) || signal !== null;
      const handleAgentProcessEnd =
        (event: 'exit' | 'close') =>
        (code: number | null, signal: NodeJS.Signals | null) => {
          console.log(`MCP agent ${event}: code=${code}, signal=${signal}`);
          void stopMcpAgent({ restart: isUnexpectedExit(code, signal) });
        };
      const handleAgentProcessError = (error: Error) => {
        console.error('MCP agent process error:', error);
        void stopMcpAgent({ restart: true });
      };

      mcpAgentProcessListeners = {
        exit: handleAgentProcessEnd('exit'),
        close: handleAgentProcessEnd('close'),
        processError: handleAgentProcessError,
        stdoutError: handleAgentStreamError('stdout'),
        stdinError: handleAgentStreamError('stdin'),
        stderrError: handleAgentStreamError('stderr'),
        stdoutClose: handleAgentStreamClose('stdout'),
        stdinClose: handleAgentStreamClose('stdin'),
        stderrClose: handleAgentStreamClose('stderr'),
      };

      child.on('error', handleAgentProcessError);
      const session = new McpStdioSession(child.stdout, child.stdin, {
        workspaceId: env.mcpStdioWorkspaceId,
        actorUserId: env.mcpStdioActorUserId,
        allowHandshake: false,
      });
      session.start();
      mcpAgentSession = session;
      mcpAgentRestartAttempts = 0;

      child.on('exit', mcpAgentProcessListeners.exit);
      child.on('close', mcpAgentProcessListeners.close);
      if (child.stdout) {
        child.stdout.on('error', mcpAgentProcessListeners.stdoutError);
        child.stdout.on('close', mcpAgentProcessListeners.stdoutClose);
      }
      if (child.stdin) {
        child.stdin.on('error', mcpAgentProcessListeners.stdinError);
        child.stdin.on('close', mcpAgentProcessListeners.stdinClose);
      }
      if (child.stderr) {
        child.stderr.on('error', mcpAgentProcessListeners.stderrError);
        child.stderr.on('close', mcpAgentProcessListeners.stderrClose);
      }

      console.log('Spawned configured MCP agent via stdio.');
    } catch (err) {
      console.error('Failed to spawn MCP agent command:', err);
      await stopMcpAgent({ restart: true });
    }
  };

  const gracefulShutdown = async (reason: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Shutdown initiated: ${reason}`);

    // Fail-safe: force exit after timeout
    const forceTimer = setTimeout(() => {
      console.error('Forcing shutdown due to timeout.');
      process.exit(1);
    }, 30_000);
    // Allow timer to not keep the event loop alive
    forceTimer.unref();

    try {
      await new Promise<void>((resolve) => {
        server.close((err) => {
          if (err) {
            console.error('Error closing HTTP server:', err);
          } else {
            console.log('HTTP server closed.');
          }
          resolve();
        });
      });
    } catch (err) {
      console.error('Error while closing HTTP server:', err);
    }

    try {
      const { pool } = await import('./db/index.js');
      if (pool && typeof (pool as any).end === 'function') {
        await (pool as any).end();
        console.log('Postgres pool ended.');
      }
    } catch (err) {
      console.error('Error ending Postgres pool:', err);
    }

    try {
      const { client } = await import('./lib/redis.js');
      if (client && client.isOpen) {
        await client.quit();
        console.log('Redis client shut down.');
      }
    } catch (err) {
      console.error('Error shutting down Redis client:', err);
    }

    clearMcpAgentRestartTimer();
    await stopMcpAgent();
    stopAutoRefresh();

    clearTimeout(forceTimer);

    // Exit with non-zero for error-style reasons
    if (reason === 'uncaughtException' || reason === 'unhandledRejection') {
      process.exit(1);
    } else {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception, initiating shutdown:', err);
    void gracefulShutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection, initiating shutdown:', reason);
    void gracefulShutdown('unhandledRejection');
  });

  // NOTE: Do not start the MCP stdio transport in the main HTTP server process.
  // MCP stdio requires exclusive use of stdout for JSON-RPC responses, but the
  // API server logs to stdout.
  // Run `server/src/modules/mcp/stdio.ts` as a separate process when stdio is needed.

  // Optionally spawn a configured agent command and attach it via stdio.
  if (env.mcpAgentCommand && env.mcpStdioWorkspaceId && env.mcpStdioActorUserId) {
    await startMcpAgent();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
