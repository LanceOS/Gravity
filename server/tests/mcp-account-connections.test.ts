import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { mcpConnectionTokens, workspaces, workspaceMembers } from '../src/db/schema.js';
import { api, createAuthenticatedApi } from './helpers/test-helpers.js';

const endpoint = '/api/v1/users/me/mcp/connections';

async function seedWorkspace(id: string, createdBy: string) {
  await db.insert(workspaces).values({
    id, name: `Workspace ${id}`, key: id.toUpperCase(), workspaceKey: `PRIVATE-${id}`, createdBy,
  });
}

async function seedConnection(id: string, workspaceId: string, generatedBy: string, extra = {}) {
  await db.insert(mcpConnectionTokens).values({
    id, workspaceId, generatedBy, tokenHash: `private-hash-${id}`, hmacKeyId: 'env',
    sourceIp: '192.0.2.123', scopes: ['tools/list'], singleUse: false, status: 'active',
    connectionType: 'streamable-http', createdAt: new Date('2026-09-24T12:00:00.000Z'), ...extra,
  });
}

describe('account MCP connection inventory', () => {
  it('requires authentication and disables response caching', async () => {
    const response = await api().get(endpoint);
    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('lists only own metadata across accessible workspaces, including history and implicit ownership', async () => {
    const account = await createAuthenticatedApi({ email: 'connection-inventory@example.com' });
    const userId = account.user.id;
    await seedWorkspace('owned', userId);
    await seedWorkspace('member', 'someone-else');
    await seedWorkspace('removed', 'someone-else');
    await db.insert(workspaceMembers).values({ workspaceId: 'member', userId, role: 'admin' });
    await seedConnection('owned-token', 'owned', userId);
    await seedConnection('member-token', 'member', userId, {
      status: 'revoked', createdAt: new Date('2026-09-24T13:00:00.000Z'),
      expiresAt: new Date('2026-09-24T13:05:00.000Z'), revokedAt: new Date('2026-09-24T13:01:00.000Z'),
    });
    await seedConnection('other-user-token', 'owned', 'someone-else');
    await seedConnection('other-member-token', 'member', 'someone-else');
    await seedConnection('removed-token', 'removed', userId);
    await seedConnection('orphan-token', 'deleted-workspace', userId);

    // Query parameters cannot select another account's inventory.
    const response = await account.get(`${endpoint}?userId=someone-else`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.map((item: { id: string }) => item.id)).toEqual(['member-token', 'owned-token']);
    expect(response.body[0]).toEqual({
      id: 'member-token', generatedBy: userId, scopes: ['tools/list'], singleUse: false,
      status: 'revoked', connectionType: 'streamable-http', clientName: null, createdAt: '2026-09-24T13:00:00.000Z',
      expiresAt: '2026-09-24T13:05:00.000Z', revokedAt: '2026-09-24T13:01:00.000Z', usedAt: null,
      workspaceId: 'member', workspaceName: 'Workspace member', workspaceKey: 'MEMBER', workspaceRole: 'admin',
    });
    expect(response.body[1]).toMatchObject({ workspaceId: 'owned', workspaceRole: 'owner' });
    for (const item of response.body) {
      expect(item).not.toHaveProperty('tokenHash');
      expect(item).not.toHaveProperty('token');
      expect(item).not.toHaveProperty('hmacKeyId');
      expect(item).not.toHaveProperty('sourceIp');
      expect(item).not.toHaveProperty('workspaceOwnerId');
      expect(item).not.toHaveProperty('membershipRole');
      expect(item.workspaceKey).not.toContain('PRIVATE');
    }
  });

  it('reflects role changes and removes workspaces immediately when membership is revoked', async () => {
    const account = await createAuthenticatedApi({ email: 'connection-membership@example.com' });
    const userId = account.user.id;
    await seedWorkspace('membership', 'workspace-owner');
    await db.insert(workspaceMembers).values({ workspaceId: 'membership', userId, role: 'admin' });
    await seedConnection('membership-token', 'membership', userId);
    expect((await account.get(endpoint)).body[0].workspaceRole).toBe('admin');

    await db.update(workspaceMembers).set({ role: 'member' })
      .where(and(eq(workspaceMembers.workspaceId, 'membership'), eq(workspaceMembers.userId, userId)));
    expect((await account.get(endpoint)).body[0].workspaceRole).toBe('member');

    await db.delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, 'membership'), eq(workspaceMembers.userId, userId)));
    const response = await account.get(endpoint);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
