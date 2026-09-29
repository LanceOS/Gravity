import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import * as requestAuth from '../src/modules/auth/utils/request-auth.js';
import * as workspaceAccess from '../src/modules/mcp/access.js';
import {
  addClient,
  disconnectSseConnection,
  MAX_CONCURRENT_SSE_CONNECTIONS_PER_USER,
  subscribeToEvents,
} from '../src/realtime.js';

const rejections = [
  { status: 401, error: 'Authentication required.' },
  { status: 403, error: 'Access denied: not a member of the workspace.' },
  { status: 429, error: 'Too many concurrent SSE connections for this user.' },
];

describe.each([false, true])('SSE denial audit failure (all sinks fail: %s)', (allSinksFail) => {
  it.each(rejections)('preserves the $status response', async ({ status, error }) => {
    vi.spyOn(requestAuth, 'resolveRequestActorUserId').mockResolvedValue(status === 401 ? null : 'audit-user');
    vi.spyOn(workspaceAccess, 'isMcpWorkspaceMember').mockResolvedValue(status !== 403);
    const connections: Response[] = [];
    if (status === 429) {
      for (let i = 0; i < MAX_CONCURRENT_SSE_CONNECTIONS_PER_USER; i += 1) {
        const connection = { end: vi.fn() } as unknown as Response;
        addClient('audit-workspace', connection, {
          userId: 'audit-user', sourceIp: null, tokenId: null, authMethod: 'session',
        });
        connections.push(connection);
      }
    }

    const sinkError = 'private audit sink configuration';
    const auditSink = vi.spyOn(console, 'info').mockImplementation(() => { throw new Error(sinkError); });
    const alertSink = vi.spyOn(console, 'error').mockImplementation(() => {
      if (allSinksFail) throw new Error('primary alert sink unavailable');
    });
    const fallbackSink = vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      if (allSinksFail) throw new Error('fallback alert sink unavailable');
      return true;
    });
    const req = {
      query: { workspaceId: 'audit-workspace' }, ip: '127.0.0.1', header: () => undefined,
    } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    try {
      await expect(subscribeToEvents(req, res)).resolves.toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(status);
      expect(res.json).toHaveBeenCalledWith({ error });
      expect(auditSink).toHaveBeenCalledOnce();
      expect(alertSink).toHaveBeenCalledOnce();
      const alert = JSON.parse(String(alertSink.mock.calls[0][0]));
      expect(alert).toMatchObject({
        message: 'security.audit_log_failed',
        failureReason: 'audit_sink_unavailable',
        failedAuditEvent: 'sse.connection.rejected',
        workspaceId: 'audit-workspace',
      });
      expect(JSON.stringify(alert)).not.toContain(sinkError);
      expect(fallbackSink).toHaveBeenCalledTimes(allSinksFail ? 1 : 0);
    } finally {
      auditSink.mockRestore();
      alertSink.mockRestore();
      fallbackSink.mockRestore();
      for (const connection of connections) disconnectSseConnection(connection, 'test_cleanup');
    }
  });
});
