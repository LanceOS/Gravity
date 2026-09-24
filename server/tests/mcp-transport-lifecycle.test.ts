import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { mcpConnectionTokens, workspaceMembers } from '../src/db/schema.js';
import { api, createAuthenticatedApi, seedWorkspaceFixture, setSecretsForTest } from './helpers/test-helpers.js';

async function fixture() {
  const ownerApi = await createAuthenticatedApi({ name: 'Transport Owner', email: 'transport-owner@example.com', role: 'owner' });
  const owner = ownerApi.user;
  const data = await seedWorkspaceFixture({ owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role } });
  return { ...data, ownerApi };
}

function data(result: any): any {
  expect(result.isError).not.toBe(true);
  return result.structuredContent.data;
}

describe('MCP transport and credentials', () => {
  it('completes the official SDK lifecycle with one API-issued credential and enforces revocation', async () => {
    const { ownerApi, workspace, project } = await fixture();
    const issued = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({
      scopes: ['tools/list', 'tools/call:list_tickets', 'tools/call:create_ticket', 'tools/call:get_ticket'],
    });
    expect(issued.status).toBe(201);
    expect(issued.body).toMatchObject({ single_use: false, args: { transport: 'streamable-http' }, auth: { scheme: 'bearer' } });
    const [row] = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, issued.body.id));
    expect(row.sourceIp).toBeNull();
    const server = createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/mcp`);
    const client = new Client({ name: 'gravity-interoperability-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: {
      Authorization: `Bearer ${issued.body.auth.token}`, 'X-Workspace-Id': workspace.id,
    } } });
    try {
      await client.connect(transport);
      await client.ping();
      const catalog = await client.listTools();
      expect(catalog.tools.map((tool) => tool.name).sort()).toEqual(['create_ticket', 'get_ticket', 'list_tickets']);
      expect(data(await client.callTool({ name: 'list_tickets', arguments: { projectId: project.id } }))).toEqual([]);
      const created = data(await client.callTool({ name: 'create_ticket', arguments: { projectId: project.id, title: 'SDK-created ticket' } }));
      const read = data(await client.callTool({ name: 'get_ticket', arguments: { ticketKey: created.ticket.key } }));
      expect(read.title).toBe('SDK-created ticket');
      const revoked = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection/${issued.body.id}/revoke`).send({});
      expect(revoked.status).toBe(200);
      await expect(client.listTools()).rejects.toThrow();
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('honors explicit bearer scope and revocation even when an owner session cookie is present', async () => {
    const { ownerApi, workspace, project } = await fixture();
    const issued = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({ scopes: ['tools/call:list_tickets'] });
    const previousBypass = process.env.ALLOW_DEV_AUTH_BYPASS;
    process.env.ALLOW_DEV_AUTH_BYPASS = 'false';
    try {
      const denied = await ownerApi.post('/api/v1/mcp').set('Authorization', `Bearer ${issued.body.auth.token}`)
        .set('X-Workspace-Id', workspace.id).send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_ticket', arguments: { projectId: project.id, title: 'Must not be created' },
        } });
      expect(denied.body.error).toMatchObject({ code: -32001, message: 'Insufficient token scopes.' });
      const revoked = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection/${issued.body.id}/revoke`).send({});
      expect(revoked.status).toBe(200);
      const rejected = await ownerApi.post('/api/v1/mcp').set('Authorization', `Bearer ${issued.body.auth.token}`)
        .set('X-Workspace-Id', workspace.id).send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      expect(rejected.status).toBe(401);
      const malformed = await ownerApi.post('/api/v1/mcp').set('Authorization', 'Bearer')
        .set('X-Workspace-Id', workspace.id).send({ jsonrpc: '2.0', id: 4, method: 'ping' });
      expect(malformed.status).toBe(401);
      const sessionOnly = await ownerApi.post('/api/v1/mcp').set('X-Workspace-Id', workspace.id)
        .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } });
      expect(data(sessionOnly.body.result)).toEqual([]);
    } finally {
      if (previousBypass === undefined) delete process.env.ALLOW_DEV_AUTH_BYPASS;
      else process.env.ALLOW_DEV_AUTH_BYPASS = previousBypass;
    }
  });

  it('returns empty 202 for notifications, 405 for GET and validates Origin and version headers', async () => {
    const { ownerApi, workspace } = await fixture();
    const issued = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
    const send = () => api().post('/api/v1/mcp').set('Authorization', `Bearer ${issued.body.auth.token}`).set('X-Workspace-Id', workspace.id);
    const notification = await send().send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(notification.status).toBe(202);
    expect(notification.text).toBe('');
    expect((await api().get('/api/v1/mcp')).status).toBe(405);
    expect((await send().set('Origin', 'https://untrusted.example').send({ jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(403);
    expect((await send().set('MCP-Protocol-Version', '1900-01-01').send({ jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(400);
    const ping = await send().set('MCP-Protocol-Version', '2025-11-25').send({ jsonrpc: '2.0', id: 2, method: 'ping' });
    expect(ping.body).toEqual({ jsonrpc: '2.0', id: 2, result: {} });
  });

  it('allows member read credentials and own inventory while rejecting write grants', async () => {
    const { ownerApi, workspace } = await fixture();
    await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
    const memberApi = await createAuthenticatedApi({ name: 'Member', email: 'transport-member@example.com', role: 'guest_contributor' });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: memberApi.user.id, role: 'member', createdAt: new Date() });
    const issued = await memberApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({ scopes: ['tools/call:list_tickets'] });
    expect(issued.status).toBe(201);
    expect((await memberApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({ scopes: ['tools/call:create_ticket'] })).status).toBe(400);
    const catalog = await memberApi.get(`/api/v1/workspaces/${workspace.id}/mcp/tools`);
    expect(catalog.body.tools.find((tool: any) => tool.name === 'list_tickets').allowedForConnection).toBe(true);
    expect(catalog.body.tools.find((tool: any) => tool.name === 'create_ticket').allowedForConnection).toBe(false);
    expect(catalog.body.tools.find((tool: any) => tool.name === 'set_ticket_status').policyParents).toEqual(['update_ticket']);
    expect(catalog.body.tools.find((tool: any) => tool.name === 'search_tickets').policyParents).toEqual(['list_tickets']);
    expect((await memberApi.get(`/api/v1/workspaces/${workspace.id}/mcp/connections`)).body.map((row: any) => row.id)).toEqual([issued.body.id]);
    const read = await api().post('/api/v1/mcp').set('Authorization', `Bearer ${issued.body.auth.token}`).set('X-Workspace-Id', workspace.id)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } });
    expect(data(read.body.result)).toEqual([]);
  });

  it('preserves API-issued env-key credentials when the old key is retained under a rotation id', async () => {
    const { ownerApi, workspace } = await fixture();
    const old = 'rotation-old-secret-at-least-32-characters';
    const restoreOld = setSecretsForTest({ betterAuthSecret: old, betterAuthOldSecrets: [] });
    let restoreNew: (() => void) | undefined;
    try {
      const issued = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
      expect(issued.status).toBe(201);
      restoreNew = setSecretsForTest({ betterAuthSecret: 'rotation-new-secret-at-least-32-characters', betterAuthOldSecrets: [`old=${old}`], betterAuthOldSecretsMap: { old } });
      const used = await api().post('/api/v1/mcp').set('Authorization', `Bearer ${issued.body.auth.token}`).set('X-Workspace-Id', workspace.id)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      expect(used.status).toBe(200);
      expect(used.body.result.tools).toEqual([]);
    } finally { restoreNew?.(); restoreOld(); }
  });

  it('does not let unauthenticated requests exhaust a workspace rate limit', async () => {
    const { ownerApi, workspace } = await fixture();
    const issued = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({});
    const client = api();
    for (let index = 0; index < 125; index++) {
      const rejected = await client.post('/api/v1/mcp').set('X-Workspace-Id', workspace.id)
        .send({ jsonrpc: '2.0', id: index, method: 'ping' });
      expect(rejected.status).toBe(401);
    }
    const accepted = await client.post('/api/v1/mcp').set('Authorization', `Bearer ${issued.body.auth.token}`)
      .set('X-Workspace-Id', workspace.id).send({ jsonrpc: '2.0', id: 126, method: 'ping' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.result).toEqual({});
  });

  it('only binds an IP when requested and rejects malformed credential options', async () => {
    const { ownerApi, workspace } = await fixture();
    const issued = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send({ bindToIp: true });
    expect(issued.status).toBe(201);
    const [row] = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, issued.body.id));
    expect(row.sourceIp).toBeTruthy();
    for (const options of [{ scopes: 'tools/call' }, { scopes: [123] }, { singleUse: 'false' }, { bindToIp: 'false' }, { ttlSeconds: 0.5 }]) {
      expect((await ownerApi.post(`/api/v1/workspaces/${workspace.id}/mcp/connection`).send(options)).status).toBe(400);
    }
  });
});
