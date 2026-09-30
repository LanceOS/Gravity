import { PassThrough } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/index.js';
import { mcpConnectionTokens } from '../src/db/schema.js';
import { createConnectionToken, verifyAndConsumeToken } from '../src/modules/mcp/connection.js';
import { McpStdioSession } from '../src/modules/mcp/stdio-session.js';
import { api, seedWorkspaceFixture } from './helpers/test-helpers.js';

describe('stdio token consumption integration', () => {
  const sessions: McpStdioSession[] = [];

  beforeEach(() => {
    vi.stubEnv('MCP_STDIO_ALLOW_HANDSHAKE', 'true');
    vi.stubEnv('MCP_STDIO_HANDSHAKE_MAX_ATTEMPTS', '2');
    vi.stubEnv('MCP_STDIO_HANDSHAKE_WINDOW_MS', '60000');
  });

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.stop()));
    vi.unstubAllEnvs();
  });

  function handshake(workspaceId: string) {
    const input = new PassThrough();
    const output = new PassThrough();
    const session = new McpStdioSession(input, output, { allowHandshake: true });
    sessions.push(session);
    session.start();
    let id = 0;
    return (token: string) => new Promise<any>((resolve) => {
      output.once('data', (data) => resolve(JSON.parse(String(data))));
      input.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'stdio/handshake', params: { token, workspaceId } }) + '\n');
    });
  }

  async function tokenState(id: string) {
    const [row] = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, id));
    return { status: row.status, usedAt: row.usedAt, usageCount: row.usageCount };
  }

  it('leaves rejected single-use tokens unconsumed and still usable once over HTTP', async () => {
    const { workspace, owner } = await seedWorkspaceFixture();
    const token = await createConnectionToken({ workspaceId: workspace.id, generatedBy: owner.id, singleUse: true });
    const initial = await tokenState(token.id);
    expect(initial).toEqual({ status: 'active', usedAt: null, usageCount: 0 });

    const send = handshake(workspace.id);
    expect((await send(token.rawToken)).error.code).toBe(-32001);
    expect(await tokenState(token.id)).toEqual(initial);

    const useHttp = () => api().post('/api/v1/mcp/sse')
      .set('Authorization', `Bearer ${token.rawToken}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect((await useHttp()).status).toBe(200);
    const consumed = await tokenState(token.id);
    expect(consumed).toEqual({ status: 'used', usedAt: expect.any(Date), usageCount: 1 });
    expect((await useHttp()).status).toBe(401);
    expect(await tokenState(token.id)).toEqual(consumed);
  });

  it('counts unsupported-token failures and blocks before consuming a subsequent reusable token', async () => {
    const { workspace, owner } = await seedWorkspaceFixture();
    const options = { workspaceId: workspace.id, generatedBy: owner.id };
    const single = await createConnectionToken({ ...options, singleUse: true });
    const reusable = await createConnectionToken({ ...options, singleUse: false });
    const send = handshake(workspace.id);

    expect((await send(single.rawToken)).error.code).toBe(-32001);
    expect((await send(single.rawToken)).error.code).toBe(-32001);
    expect((await send(reusable.rawToken)).error.code).toBe(-32029);
    for (const token of [single, reusable]) {
      expect(await tokenState(token.id)).toEqual({ status: 'active', usedAt: null, usageCount: 0 });
    }

    // The throttle is session-local; an unblocked session can use the token.
    expect((await handshake(workspace.id)(reusable.rawToken)).result.ok).toBe(true);
    expect(await tokenState(reusable.id)).toEqual({ status: 'active', usedAt: expect.any(Date), usageCount: 1 });
  });

  it('keeps the default single-use conditional update limited to one successful consumer', async () => {
    const { workspace, owner } = await seedWorkspaceFixture();
    const token = await createConnectionToken({ workspaceId: workspace.id, generatedBy: owner.id, singleUse: true });
    const results = await Promise.all(Array.from({ length: 4 }, () => verifyAndConsumeToken(token.rawToken, workspace.id)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await tokenState(token.id)).toEqual({ status: 'used', usedAt: expect.any(Date), usageCount: 1 });
  });
});
