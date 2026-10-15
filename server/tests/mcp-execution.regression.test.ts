import { beforeEach, describe, expect, it } from 'vitest';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { workspaceSettings, tickets, workspaceMembers } from '../src/db/schema.js';
import { bootstrapMcpRegistries } from '../src/modules/mcp/bootstrap.js';
import { executeTool } from '../src/modules/mcp/tool-executor.js';
import { handleMcpRequest } from '../src/modules/mcp/request-handler.js';
import { listCanonicalTools } from '../src/modules/mcp/tools.js';
import { seedWorkspaceFixture, seedTicket, seedUser } from './helpers/test-helpers.js';

beforeEach(() => bootstrapMcpRegistries());

async function fixture(disabled: string[] = []) {
  const context = await seedWorkspaceFixture();
  const ticket = await seedTicket(context.project.id);
  await db.update(workspaceSettings).set({ disabledMcpTools: disabled })
    .where(eq(workspaceSettings.workspaceId, context.workspace.id));
  return { ...context, ticket };
}

function request(name: string, args: unknown) {
  return { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } };
}

describe('MCP execution boundary', () => {
  it('rejects malformed label input before any write and rejects extra mutation fields', async () => {
    const { workspace, owner, ticket } = await fixture();
    const missing = await handleMcpRequest(request('set_ticket_labels', { ticketKey: ticket.key }), workspace.id, owner.id);
    expect(missing).toMatchObject({ error: { code: -32602 } });
    const extra = await handleMcpRequest(request('set_ticket_status', { ticketKey: ticket.key, status: 'done', title: 'Unauthorized edit' }), workspace.id, owner.id);
    expect(extra).toMatchObject({ error: { code: -32602 } });
    for (const argumentsValue of [null, [], 'invalid']) {
      const invalid = await handleMcpRequest(request('list_projects', argumentsValue), workspace.id, owner.id);
      expect(invalid).toMatchObject({ error: { code: -32602 } });
    }
    const [stored] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(stored.title).toBe(ticket.title);
    expect(stored.status).toBe(ticket.status);
  });

  it('enforces disablement in direct execution, every read alias and focused updates', async () => {
    const { workspace, owner, ticket } = await fixture(['get_ticket_details', 'update_ticket']);
    for (const name of ['get_ticket', 'get_ticket_details', 'read_ticket_details']) {
      await expect(executeTool(name, { ticketKey: ticket.key }, workspace.id, owner.id)).rejects.toThrow('disabled');
    }
    await expect(executeTool('set_ticket_priority', { ticketKey: ticket.key, priority: 'high' }, workspace.id, owner.id)).rejects.toThrow('disabled');
  });

  it('cannot bypass a focused field policy through update_ticket', async () => {
    const { workspace, owner, ticket } = await fixture(['set_ticket_priority', 'unassign_ticket']);
    await expect(executeTool('update_ticket', { ticketKey: ticket.key, priority: 'high' }, workspace.id, owner.id)).rejects.toThrow('disabled');
    await expect(executeTool('update_ticket', { ticketKey: ticket.key, assigneeId: null }, workspace.id, owner.id)).rejects.toThrow('disabled');
    await expect(executeTool('update_ticket', { ticketKey: ticket.key, title: 'Allowed edit' }, workspace.id, owner.id)).resolves.toBeDefined();
  });

  it.each(['assign_ticket', 'update_ticket'])('cannot clear an assignee with whitespace through %s', async (name) => {
    const { workspace, owner, ticket } = await fixture(['unassign_ticket']);
    await db.update(tickets).set({ assigneeId: owner.id }).where(eq(tickets.id, ticket.id));
    for (const assigneeId of [' ', '\t\n', '\u00a0']) {
      await expect(executeTool(name, { ticketKey: ticket.key, assigneeId }, workspace.id, owner.id))
        .rejects.toMatchObject({ code: -32602 });
      const [stored] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
      expect(stored.assigneeId).toBe(owner.id);
    }
    await expect(executeTool(name, { ticketKey: ticket.key, assigneeId: owner.id }, workspace.id, owner.id))
      .resolves.toBeDefined();
  });

  it('advertises one canonical alias and only scoped callable tools', async () => {
    const { workspace, owner } = await fixture();
    const response: any = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, workspace.id, owner.id, {
      tokenScopes: ['tools/list', 'tools/call:read_ticket_details'],
    });
    expect(response.result.tools.map((tool: any) => tool.name)).toEqual(['get_ticket']);
    const canonical = listCanonicalTools();
    expect(new Set(canonical.map((tool) => tool.name)).size).toBe(canonical.length);
    expect(canonical.find((tool) => tool.name === 'get_ticket')?.aliases).toContain('read_ticket_details');
  });

  it('advertises SDK-valid, exclusive success and error output shapes for every tool', () => {
    const sdkValidator = new AjvJsonSchemaValidator();
    for (const tool of listCanonicalTools()) {
      const validate = sdkValidator.getValidator(tool.outputSchema!);
      expect(validate({ data: null }).valid, tool.name).toBe(true);
      expect(validate({ error: { code: 'INVALID_ARGUMENTS', message: 'Invalid input.' } }).valid, tool.name).toBe(true);
      expect(validate({}).valid, tool.name).toBe(false);
      expect(validate({ data: null, error: { code: 'FAILURE', message: 'Failed.' } }).valid, tool.name).toBe(false);
      expect(validate({ error: { message: 'Missing code.' } }).valid, tool.name).toBe(false);
    }
  });

  it('returns SDK-valid structured successes, execution failures, and validation failures', async () => {
    const { workspace, owner, ticket } = await fixture();
    const listed: any = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, workspace.id, owner.id);
    const sdkValidator = new AjvJsonSchemaValidator();
    const validateFor = (name: string, response: any) => {
      const schema = listed.result.tools.find((tool: { name: string }) => tool.name === name).outputSchema;
      expect(sdkValidator.getValidator(schema)(response.result.structuredContent).valid).toBe(true);
      expect(JSON.parse(response.result.content[0].text)).toEqual(
        response.result.isError ? response.result.structuredContent.error : response.result.structuredContent.data,
      );
    };

    const success: any = await handleMcpRequest(request('get_ticket', { ticketKey: ticket.key }), workspace.id, owner.id);
    expect(success.result.isError).toBe(false);
    validateFor('get_ticket', success);

    const missing: any = await handleMcpRequest(request('get_ticket', { ticketKey: 'NONE-999' }), workspace.id, owner.id);
    expect(missing.result).toMatchObject({ isError: true, structuredContent: { error: {
      code: 'TOOL_EXECUTION_FAILED', message: expect.any(String),
    } } });
    validateFor('get_ticket', missing);

    const unsafeBody = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'image', attrs: { src: 'javascript:alert(1)' } },
    ] }] });
    const invalid: any = await handleMcpRequest(request('create_comment', { ticketKey: ticket.key, body: unsafeBody }), workspace.id, owner.id);
    expect(invalid.result).toMatchObject({ isError: true, structuredContent: { error: {
      code: 'INVALID_ARGUMENTS', message: 'Comment body must contain safe content.',
    } } });
    validateFor('create_comment', invalid);

    const domain: any = await handleMcpRequest(request('preview_ticket_dependency', {
      operation: 'add', blocker_ticket_key: ticket.key, dependent_ticket_key: ticket.key,
    }), workspace.id, owner.id);
    expect(domain.result).toMatchObject({ isError: true, structuredContent: { error: {
      code: 'SELF_REFERENCE', status: 'self_reference', message: 'A ticket cannot block or depend on itself.',
    } } });
    validateFor('preview_ticket_dependency', domain);
  });

  it('keeps malformed arguments and authorization failures as actionable JSON-RPC errors', async () => {
    const { workspace, owner, ticket } = await fixture();
    const invalid = await handleMcpRequest(request('set_ticket_status', { ticketKey: ticket.key }), workspace.id, owner.id);
    expect(invalid).toMatchObject({ error: { code: -32602, message: expect.stringContaining('Invalid arguments') } });
    expect(invalid).not.toHaveProperty('result');

    const unauthorized = await handleMcpRequest(request('set_ticket_status', {
      ticketKey: ticket.key, status: 'done',
    }), workspace.id, owner.id, { tokenScopes: ['tools/call:get_ticket'] });
    expect(unauthorized).toMatchObject({ error: { code: -32001, message: 'Insufficient token scopes.' } });
    expect(unauthorized).not.toHaveProperty('result');
  });

  it('rechecks the token issuer role at write time while retaining read access', async () => {
    const { workspace, ticket } = await fixture();
    const member = await seedUser({ id: 'demoted-admin', email: 'demoted@example.com' });
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: member.id, role: 'member' });
    await expect(executeTool('update_ticket', { ticketKey: ticket.key, title: 'No access' }, workspace.id, member.id, { tokenScopes: ['tools/call'] })).rejects.toThrow('owner or admin');
    await expect(executeTool('get_ticket', { ticketKey: ticket.key }, workspace.id, member.id, { tokenScopes: ['tools/call:get_ticket'] })).resolves.toBeDefined();
  });

  it('does not resolve prototype names as handlers', async () => {
    const { workspace, owner } = await fixture();
    for (const name of ['constructor', 'toString', '__proto__']) {
      await expect(executeTool(name, {}, workspace.id, owner.id)).rejects.toThrow('Unknown tool');
    }
  });

  it('distinguishes malformed requests, notifications, ping and domain errors', async () => {
    const { workspace, owner } = await fixture();
    expect(await handleMcpRequest(null)).toMatchObject({ error: { code: -32600 } });
    expect(await handleMcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect(await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'ping' })).toMatchObject({ result: {} });
    const missing = await handleMcpRequest(request('get_ticket', { ticketKey: 'NONE-999' }), workspace.id, owner.id);
    expect(missing).toMatchObject({ result: { isError: true, structuredContent: { error: { code: 'TOOL_EXECUTION_FAILED' } } } });
  });
});
