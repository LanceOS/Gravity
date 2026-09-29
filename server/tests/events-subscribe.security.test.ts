import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { workspaceMembers } from '../src/db/schema.js';
import { client as redisClient, setClient } from '../src/lib/redis.js';
import { isWorkspaceMember } from '../src/modules/workspaces/services/membership.js';
import { createConnectionToken } from '../src/modules/mcp/connection.js';
import { createApp } from '../src/app.js';
import { _clearInMemoryRateLimitStore } from '../src/lib/rateLimit.js';
import * as logger from '../src/lib/logger.js';
import {
  SSE_EVENTS_IP_RATE_LIMIT_MAX,
} from '../src/routes/index.js';
import {
  MAX_CONCURRENT_SSE_CONNECTIONS_PER_USER,
} from '../src/realtime.js';
import {
  createAuthenticatedApi,
  readSseChunk,
  seedWorkspaceFixture,
} from './helpers/test-helpers.js';

type OpenSseHandle = {
  response: http.IncomingMessage;
  firstChunk: Promise<string>;
  closed: Promise<void>;
  close: () => Promise<void>;
};

type OpenOptions = {
  headers?: http.OutgoingHttpHeaders;
};

type ServerHandle = {
  port: number;
  close: () => Promise<void>;
};

function waitForServerListening(server: http.Server) {
  return new Promise<AddressInfo>((resolve, reject) => {
    const onListening = () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind SSE test server.'));
        return;
      }
      resolve(address as AddressInfo);
    };

    server.once('error', reject);
    server.once('listening', onListening);
  });
}

async function openPersistentSseConnection(path: string, options: OpenOptions = {}): Promise<OpenSseHandle> {
  const app = createApp();
  const server = app.listen(0);
  const address = await waitForServerListening(server);

  const request = http.request({
    host: '127.0.0.1',
    method: 'GET',
    path,
    port: address.port,
    headers: options.headers,
  });

  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    request.once('error', reject);
    request.once('response', (res) => {
      res.setEncoding('utf8');
      if ((res.statusCode ?? 0) >= 400) {
        res.resume();
        reject(new Error(`SSE handshake failed: ${res.statusCode}`));
        return;
      }
      resolve(res);
    });
    request.end();
  });

  const closed = new Promise<void>((resolve) => {
    response.once('close', resolve);
  });

  const firstChunk = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for first SSE chunk.'));
    }, 1500);
    response.once('data', (chunk) => {
      clearTimeout(timeout);
      resolve(typeof chunk === 'string' ? chunk : chunk.toString());
    });
    response.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    response.once('close', () => {
      clearTimeout(timeout);
      reject(new Error('SSE connection closed before first chunk.'));
    });
  });

  let isClosing = false;
  const close = async () => {
    if (isClosing) {
      return;
    }
    isClosing = true;

    response.destroy();
    await new Promise<void>((resolve, reject) => {
      if (server.listening) {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
        return;
      }
      resolve();
    });
  };

  return {
    response,
    firstChunk,
    closed,
    close,
  };
}

async function openSseTestServer(): Promise<ServerHandle> {
  const app = createApp();
  const server = app.listen(0);
  const address = await waitForServerListening(server);

  const close = async () => {
    if (!server.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  return {
    port: address.port,
    close,
  };
}

function parseSseErrorBody(chunk: string) {
  try {
    return JSON.parse(chunk) as { error?: string };
  } catch (_error) {
    return { error: chunk.trim() };
  }
}

async function readSseChunkFromPort(
  port: number,
  path: string,
  options: { headers?: http.OutgoingHttpHeaders } = {},
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; chunk: string }> {
  return await new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      method: 'GET',
      path,
      port,
      headers: options.headers,
    }, (res) => {
      res.setEncoding('utf8');
      const chunks: string[] = [];

      const finalize = () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          chunk: chunks.join(''),
        });
      };

      if ((res.statusCode ?? 0) >= 400) {
        res.on('data', (chunk) => {
          chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
        });
        res.once('end', finalize);
        res.once('error', reject);
        return;
      }

      res.once('data', (chunk) => {
        chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
        finalize();
        res.destroy();
      });
      res.once('end', finalize);
      res.once('error', reject);
    });

    req.once('error', reject);
    req.end();
  });
}

function wait(timeoutMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

describe('SSE endpoint security', () => {
  beforeEach(() => {
    _clearInMemoryRateLimitStore();
    vi.restoreAllMocks();
  });

  it('requires session cookie validation and blocks unauthenticated subscribers', async () => {
    const auditSpy = vi.spyOn(logger, 'audit').mockImplementation(() => {});
    const response = await readSseChunk('/api/v1/events/subscribe?workspaceId=workspace-1');
    expect(response.statusCode).toBe(401);
    expect(parseSseErrorBody(response.chunk).error).toBe('Authentication required.');
    expect(auditSpy).toHaveBeenCalledWith('sse.connection.rejected', expect.objectContaining({
      workspaceId: 'workspace-1', status: 401, reason: 'authentication_required_or_invalid',
    }));
  });

  it.each(['session', 'token'] as const)('rejects removed members despite stale cached membership (%s)', async (method) => {
    const memberApi = await createAuthenticatedApi({
      name: 'Removed SSE Member', email: 'sse-removed@example.com', role: 'member',
    });
    const { workspace } = await seedWorkspaceFixture();
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: memberApi.user.id, role: 'member' });
    const token = await createConnectionToken({ workspaceId: workspace.id, generatedBy: memberApi.user.id });
    await db.delete(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, memberApi.user.id),
    ));

    const previousClient = redisClient;
    const auditSpy = vi.spyOn(logger, 'audit').mockImplementation(() => {});
    // Model delayed cache population or failed invalidation following removal.
    setClient({ isOpen: true, isReady: true, get: async () => JSON.stringify('member') } as never);
    try {
      expect(await isWorkspaceMember(workspace.id, memberApi.user.id)).toBe(true);
      const query = method === 'token' ? `&token=${encodeURIComponent(token.rawToken)}` : '';
      const response = await readSseChunk(`/api/v1/events/subscribe?workspaceId=${workspace.id}${query}`, {
        headers: method === 'session' ? { Cookie: memberApi.sessionCookie } : {},
      });
      expect(response.statusCode).toBe(403);
      expect(parseSseErrorBody(response.chunk).error).toBe('Access denied: not a member of the workspace.');
      expect(auditSpy).toHaveBeenCalledWith('sse.connection.rejected', expect.objectContaining({
        workspaceId: workspace.id, status: 403, reason: 'workspace_access_denied',
      }));
      expect(JSON.stringify(auditSpy.mock.calls)).not.toContain(token.rawToken);
      expect(JSON.stringify(auditSpy.mock.calls)).not.toContain(memberApi.sessionCookie);
    } finally {
      setClient(previousClient);
    }
  });

  it('enforces workspace membership for session-authenticated SSE subscriptions', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Workspace Owner',
      email: 'sse-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const outsiderApi = await createAuthenticatedApi({
      name: 'Workspace Outsider',
      email: 'sse-outsider@example.com',
      role: 'member',
      avatarUrl: 'https://example.com/outsider.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        avatarUrl: owner.avatar,
      },
    });

    const path = `/api/v1/events/subscribe?workspaceId=${workspace.id}`;

    const memberResponse = await readSseChunk(path, {
      headers: { Cookie: ownerApi.sessionCookie },
    });
    expect(memberResponse.statusCode).toBe(200);
    expect(String(memberResponse.headers['content-type'])).toContain('text/event-stream');
    expect(memberResponse.chunk).toContain('Connected to Gravity live stream');

    const outsiderResponse = await readSseChunk(path, {
      headers: { Cookie: outsiderApi.sessionCookie },
    });
    expect(outsiderResponse.statusCode).toBe(403);
    expect(parseSseErrorBody(outsiderResponse.chunk).error).toBe('Access denied: not a member of the workspace.');
  });

  it('enforces per-user concurrent SSE connection limits', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Concurrent Owner',
      email: 'sse-concurrency-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        avatarUrl: owner.avatar,
      },
    });
    const path = `/api/v1/events/subscribe?workspaceId=${workspace.id}`;
    const headers = { Cookie: ownerApi.sessionCookie };

    const connections: OpenSseHandle[] = [];
    for (let i = 0; i < MAX_CONCURRENT_SSE_CONNECTIONS_PER_USER; i += 1) {
      const connection = await openPersistentSseConnection(path, { headers });
      await connection.firstChunk;
      connections.push(connection);
    }

    const blockedResponse = await readSseChunk(path, { headers });
    expect(blockedResponse.statusCode).toBe(429);
    expect(parseSseErrorBody(blockedResponse.chunk).error).toBe('Too many concurrent SSE connections for this user.');

    await Promise.all(connections.map((connection) => connection.close()));
  });

  it('enforces per-IP connection rate limiting', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Ip Rate Limit Owner',
      email: 'sse-ip-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        avatarUrl: owner.avatar,
      },
    });
    const path = `/api/v1/events/subscribe?workspaceId=${workspace.id}`;
    const headers = { Cookie: ownerApi.sessionCookie };
    let blockedAt = -1;
    const server = await openSseTestServer();

    try {
      for (let i = 0; i < SSE_EVENTS_IP_RATE_LIMIT_MAX + 2; i += 1) {
        const response = await readSseChunkFromPort(server.port, path, { headers });
        if (response.statusCode === 429) {
          blockedAt = i + 1;
          break;
        }
      }
    } finally {
      await server.close();
    }

    expect(blockedAt).toBeGreaterThan(0);
    expect(blockedAt).toBeLessThanOrEqual(SSE_EVENTS_IP_RATE_LIMIT_MAX + 1);
  });

  it('accepts short-lived single-use SSE auth tokens and rejects reused tokens', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Token SSE Owner',
      email: 'sse-token-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        avatarUrl: owner.avatar,
      },
    });

    const createTokenResponse = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({
      ttlSeconds: 30,
      singleUse: true,
    });
    const token = createTokenResponse.body.auth?.token;
    expect(createTokenResponse.status).toBe(201);
    expect(typeof token).toBe('string');

    const first = await readSseChunk(`/api/v1/events/subscribe?workspaceId=${workspace.id}&token=${encodeURIComponent(token)}`);
    expect(first.statusCode).toBe(200);

    const second = await readSseChunk(`/api/v1/events/subscribe?workspaceId=${workspace.id}&token=${encodeURIComponent(token)}`);
    expect(second.statusCode).toBe(401);
    expect(parseSseErrorBody(second.chunk).error).toBe('Invalid or expired token.');
  });

  it('rejects expired SSE auth tokens after TTL', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Token SSE Expiry Owner',
      email: 'sse-token-expiry-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        avatarUrl: owner.avatar,
      },
    });

    const createTokenResponse = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({
      ttlSeconds: 1,
      singleUse: false,
    });
    const token = createTokenResponse.body.auth?.token;
    expect(createTokenResponse.status).toBe(201);

    const valid = await readSseChunk(`/api/v1/events/subscribe?workspaceId=${workspace.id}&token=${encodeURIComponent(token)}`);
    expect(valid.statusCode).toBe(200);

    await wait(1_100);

    const expired = await readSseChunk(`/api/v1/events/subscribe?workspaceId=${workspace.id}&token=${encodeURIComponent(token)}`);
    expect(expired.statusCode).toBe(401);
    expect(parseSseErrorBody(expired.chunk).error).toBe('Invalid or expired token.');
  });

  it('disconnects active token-authenticated SSE sessions when the token is revoked', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Token SSE Revoke Owner',
      email: 'sse-token-revoke-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        avatarUrl: owner.avatar,
      },
    });

    const createTokenResponse = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({
      ttlSeconds: 120,
      singleUse: false,
    });
    const tokenRowId = createTokenResponse.body.id;
    const token = createTokenResponse.body.auth?.token;
    expect(createTokenResponse.status).toBe(201);
    expect(typeof token).toBe('string');

    const connection = await openPersistentSseConnection(
      `/api/v1/events/subscribe?workspaceId=${workspace.id}&token=${encodeURIComponent(token)}`,
    );
    await connection.firstChunk;

    const revokeResponse = await ownerApi.post(
      `/api/v1/workspaces/${workspace.id}/mcp/connection/${tokenRowId}/revoke`,
    ).send({});
    expect(revokeResponse.status).toBe(200);

    await Promise.race([
      connection.closed,
      wait(2_000).then(() => {
        throw new Error('Timed out waiting for token revocation disconnect.');
      }),
    ]);

    await connection.close();

    const reusedAfterRevoke = await readSseChunk(
      `/api/v1/events/subscribe?workspaceId=${workspace.id}&token=${encodeURIComponent(token)}`,
    );
    expect(reusedAfterRevoke.statusCode).toBe(401);
    expect(parseSseErrorBody(reusedAfterRevoke.chunk).error).toBe('Invalid or expired token.');
  });

  it('emits audit logs for SSE connection open and close events', async () => {
    const auditSpy = vi.spyOn(logger, 'audit').mockImplementation(() => {});
    const ownerApi = await createAuthenticatedApi({
      name: 'Audit SSE Owner',
      email: 'sse-audit-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/owner.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        avatarUrl: owner.avatar,
      },
    });

    const connection = await openPersistentSseConnection(`/api/v1/events/subscribe?workspaceId=${workspace.id}`, {
      headers: { Cookie: ownerApi.sessionCookie },
    });
    await connection.firstChunk;

    await connection.close();
    await connection.closed;

    expect(auditSpy).toHaveBeenCalledWith(
      'sse.connection.opened',
      expect.objectContaining({
        workspaceId: workspace.id,
        userId: owner.id,
        authMethod: 'session',
      }),
    );

    await expect.poll(() => {
      return auditSpy.mock.calls.some((call) => {
        if (call[0] !== 'sse.connection.closed') {
          return false;
        }

        const payload = call[1];
        return (
          typeof payload === 'object'
          && payload !== null
          && 'workspaceId' in payload
          && (payload as { workspaceId?: string }).workspaceId === workspace.id
          && 'userId' in payload
          && (payload as { userId?: string }).userId === owner.id
          && 'reason' in payload
          && (payload as { reason?: string }).reason === 'request_closed'
        );
      });
    }).toBe(true);
  });
});
