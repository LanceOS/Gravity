import * as readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { handleMcpRequest } from './request-handler.js';
import { createMcpErrorResponse } from './responses.js';

export type McpSessionOptions = {
  workspaceId?: string | null;
  actorUserId?: string | null;
  sanitize?: boolean;
  tokenScopes?: string[] | undefined;
  // When true, the session will accept a `stdio/handshake` method to
  // establish the trusted context (token or workspace) dynamically.
  allowHandshake?: boolean;
};

export class McpStdioSession {
  private rl?: readline.Interface;

  constructor(private input: Readable, private output: Writable, private options: McpSessionOptions = {}) {}

  start() {
    this.rl = readline.createInterface({ input: this.input, terminal: false });

    this.rl.on('line', async (line: string) => {
      if (!line.trim()) return;

      let request: unknown;
      try {
        request = JSON.parse(line);
      } catch (err) {
        this.send(
          createMcpErrorResponse(null, -32700, 'Parse error'),
        );
        return;
      }

      const payload = request as any;

      // Optional handshake flow for dynamic token-based auth.
      if (this.options.allowHandshake && payload?.method === 'stdio/handshake') {
        // Handshake semantics are intentionally small here: if a token is
        // provided the session will attempt token verification via the
        // existing connection helpers. Otherwise, a preconfigured context
        // must be present.
        const params = payload.params ?? {};
        const token = typeof params.token === 'string' ? params.token.trim() : '';
        const workspaceId = typeof params.workspaceId === 'string' ? params.workspaceId.trim() : '';

        if (token && workspaceId) {
          try {
            const { verifyAndConsumeToken } = await import('./connection.js');
            const tokenRow = await verifyAndConsumeToken(token, workspaceId, {});
            if (!tokenRow) {
              this.send(createMcpErrorResponse(payload.id ?? null, -32001, 'Invalid or expired token.'));
              return;
            }
            this.options.workspaceId = workspaceId;
            this.options.actorUserId = tokenRow.generatedBy;
            this.options.tokenScopes = Array.isArray(tokenRow.scopes) ? tokenRow.scopes : [];
            this.send({ jsonrpc: '2.0', id: payload.id ?? null, result: { ok: true } });
            return;
          } catch (err) {
            this.send(createMcpErrorResponse(payload.id ?? null, -32603, 'Handshake failed.'));
            return;
          }
        }

        // If no token provided, require that the session was started with
        // a preconfigured trusted context.
        if (!this.options.workspaceId || !this.options.actorUserId) {
          this.send(createMcpErrorResponse(payload.id ?? null, -32602, 'Handshake requires workspaceId and token or pre-configured context.'));
          return;
        }

        this.send({ jsonrpc: '2.0', id: payload.id ?? null, result: { ok: true } });
        return;
      }

      // Ensure the session has a trusted context before delegating to the
      // MCP handler. This prevents passing empty strings for actor/workspace.
      const workspaceId = this.options.workspaceId ?? '';
      const actorUserId = this.options.actorUserId ?? '';

      if (!workspaceId || !actorUserId) {
        this.send(createMcpErrorResponse(payload?.id ?? null, -32002, 'Authentication required.'));
        return;
      }

      try {
        const resp = await handleMcpRequest(request, workspaceId, actorUserId, {
          accessChecked: Array.isArray(this.options.tokenScopes),
          sanitize: !!this.options.sanitize,
          tokenScopes: this.options.tokenScopes,
        });
        this.send(resp);
      } catch (err) {
        this.send(createMcpErrorResponse(payload?.id ?? null, -32603, err instanceof Error ? err.message : String(err)));
      }
    });
  }

  send(msg: unknown) {
    try {
      const s = JSON.stringify(msg);
      this.output.write(s + '\n');
    } catch (e) {
      // best-effort
    }
  }

  stop() {
    this.rl?.close();
  }
}
