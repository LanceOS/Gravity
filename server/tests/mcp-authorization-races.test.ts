import { describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { mcpConnectionTokens, workspaceMembers, workspaceSettings, tickets } from '../src/db/schema.js';
import { client as redisClient, setClient } from '../src/lib/redis.js';
import { isWorkspaceMember, getWorkspaceMemberRole } from '../src/modules/workspaces/services/membership.js';
import { isMcpWorkspaceMember, McpWorkspaceAccessService } from '../src/modules/mcp/access.js';
import { bootstrapMcpRegistries } from '../src/modules/mcp/bootstrap.js';
import { handleMcpRequest } from '../src/modules/mcp/request-handler.js';
import { executeTool } from '../src/modules/mcp/tool-executor.js';
import { createConnectionToken, refreshConnectionToken, verifyAndConsumeToken, verifyConnectionTokenSession } from '../src/modules/mcp/connection.js';
import { api, seedUser, seedWorkspaceFixture, seedTicket } from './helpers/test-helpers.js';

describe('MCP authorization races', () => {
  it('denies removed issuers even while Redis returns a stale membership grant', async () => {
    const { workspace } = await seedWorkspaceFixture();
    const member = await seedUser({ id: 'removed-mcp-member', email: 'removed-mcp-member@example.com' });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: member.id, role: 'member' });
    const token = await createConnectionToken({ workspaceId: workspace.id, generatedBy: member.id, scopes: ['tools/list', 'tools/call:list_tickets'] });
    const [row] = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, token.id));
    expect(await isMcpWorkspaceMember(workspace.id, member.id)).toBe(true);
    await db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, member.id)));

    const previousClient = redisClient;
    // Represents a delayed cache fill or a failed invalidation after removal.
    setClient({ isOpen: true, isReady: true, get: async () => JSON.stringify('member') } as never);
    try {
      expect(await isWorkspaceMember(workspace.id, member.id)).toBe(true);
      expect(await new McpWorkspaceAccessService().hasWorkspaceAccess(workspace.id, member.id)).toBe(false);
      expect(await verifyConnectionTokenSession(token.id, workspace.id, member.id, row.tokenHash)).toBeNull();
      bootstrapMcpRegistries();
      await expect(executeTool('list_tickets', {}, workspace.id, member.id, { tokenScopes: token.scopes }))
        .rejects.toThrow('Unauthorized workspace access.');
    } finally {
      setClient(previousClient);
    }
  });

  it('denies a demoted admin access to another issuer token despite a stale cached admin role', async () => {
    const { owner, workspace } = await seedWorkspaceFixture();
    const admin = await seedUser({ id: 'demoted-mcp-admin', email: 'demoted-mcp-admin@example.com' });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: admin.id, role: 'admin' });
    const ownerToken = await createConnectionToken({ workspaceId: workspace.id, generatedBy: owner.id, scopes: ['tools/list', 'tools/call:create_ticket'] });
    await db.update(workspaceMembers).set({ role: 'member' })
      .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, admin.id)));
    const previousClient = redisClient;
    setClient({ isOpen: true, isReady: true, get: async () => JSON.stringify('admin') } as never);
    try {
      expect(await getWorkspaceMemberRole(workspace.id, admin.id)).toBe('admin');
      const connectionPath = `/api/v1/workspaces/${workspace.id}/mcp/connection`;
      const requests = api();
      expect((await requests.post(`${connectionPath}/${ownerToken.id}/refresh`).set('X-User-Id', admin.id).send({})).status).toBe(403);
      expect((await requests.post(`${connectionPath}/${ownerToken.id}/revoke`).set('X-User-Id', admin.id).send({})).status).toBe(403);
      expect((await requests.post(connectionPath).set('X-User-Id', admin.id).send({ scopes: ['tools/call:create_ticket'] })).status).toBe(400);
      expect((await requests.get(`${connectionPath}s`).set('X-User-Id', admin.id)).body).toEqual([]);
      const catalog = await requests.get(`/api/v1/workspaces/${workspace.id}/mcp/tools`).set('X-User-Id', admin.id);
      expect(catalog.body.tools.find((tool: any) => tool.name === 'create_ticket').allowedForConnection).toBe(false);
    } finally {
      setClient(previousClient);
    }
    expect(await verifyAndConsumeToken(ownerToken.rawToken, workspace.id)).toBeTruthy();
  });

  it('rejects prototype fields before sanitized calls can bypass focused mutation policy', async () => {
    const { owner, workspace, project } = await seedWorkspaceFixture();
    const ticket = await seedTicket(project.id, { status: 'todo' });
    await db.update(workspaceSettings).set({ disabledMcpTools: ['set_ticket_status'] })
      .where(eq(workspaceSettings.workspaceId, workspace.id));
    bootstrapMcpRegistries();
    const args = JSON.parse(`{"ticketKey":"${ticket.key}","__proto__":{"status":"done"}}`);
    const result = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_ticket', arguments: args } },
      workspace.id, owner.id, { sanitize: true, tokenScopes: ['tools/call:update_ticket'] });
    expect(result).toMatchObject({ error: { code: -32602 } });
    const [persisted] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(persisted.status).toBe('todo');
  });

  it('preserves implicit creator access and rejects nonexistent workspaces', async () => {
    const { owner, workspace } = await seedWorkspaceFixture();
    await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspace.id));
    expect(await isMcpWorkspaceMember(workspace.id, owner.id)).toBe(true);
    expect(await isMcpWorkspaceMember('missing-workspace', owner.id)).toBe(false);
  });

  it.each([false, true])('cannot authenticate an old token after a concurrent refresh (singleUse=%s)', async (singleUse) => {
    const { owner, workspace } = await seedWorkspaceFixture();
    const token = await createConnectionToken({ workspaceId: workspace.id, generatedBy: owner.id, singleUse });
    const [snapshot] = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, token.id));
    let replacement: Awaited<ReturnType<typeof refreshConnectionToken>>;
    // Simulate READ COMMITTED: verifier selected the old row, then rotation
    // committed before verifier's UPDATE. Keep the UPDATE real to exercise its
    // compare-and-swap guard, not a mocked authorization result.
    const transaction = vi.spyOn(db, 'transaction').mockImplementationOnce(async (callback: any) => {
      replacement = await refreshConnectionToken(token.id, owner.id);
      return callback({
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [snapshot] }) }) }),
        update: db.update.bind(db),
      });
    });
    try {
      expect(await verifyAndConsumeToken(token.rawToken, workspace.id)).toBeNull();
    } finally {
      transaction.mockRestore();
    }
    const [current] = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, token.id));
    expect(current.status).toBe('active');
    expect(current.usageCount).toBe(0);
    expect(await verifyAndConsumeToken(replacement!.rawToken, workspace.id)).toBeTruthy();
  });
});
