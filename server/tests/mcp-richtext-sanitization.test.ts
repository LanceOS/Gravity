import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapMcpRegistries } from '../src/app.js';
import { db } from '../src/db/index.js';
import { comments } from '../src/db/schema.js';
import { McpRequestHandler } from '../src/modules/mcp/request-handler.js';
import { seedTicket, seedWorkspaceFixture } from './helpers/test-helpers.js';

async function setupMcpTicket() {
  bootstrapMcpRegistries();
  const { owner, project, workspace } = await seedWorkspaceFixture();
  const ticket = await seedTicket(project.id);
  const commentId = 'mcp-sanitization-comment';
  await db.insert(comments).values({
    id: commentId,
    ticketId: ticket.id,
    userId: owner.id,
    body: 'Keep this existing comment',
    createdAt: new Date(),
  });

  const handler = new McpRequestHandler();
  const callTool = (name: string, args: Record<string, unknown>) => handler.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  }, workspace.id, owner.id);

  return { owner, project, workspace, ticket, commentId, callTool };
}

describe('MCP rich-text sanitization', () => {
  it.each(['add_comment', 'create_comment', 'update_comment'])(
    'reports unsafe-only %s bodies as tool errors and preserves comments',
    async (toolName) => {
      const { ticket, commentId, callTool } = await setupMcpTicket();
      const body = JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [
          { type: 'image', attrs: { src: 'javascript:alert(1)' } },
        ] }],
      });

      const response = await callTool(toolName, {
        ticketKey: ticket.key,
        body,
        ...(toolName === 'update_comment' ? { commentId } : {}),
      });

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: {
          isError: true,
          structuredContent: { error: {
            code: 'INVALID_ARGUMENTS',
            message: 'Comment body must contain safe content.',
          } },
        },
      });
      expect(await db.select().from(comments).where(eq(comments.ticketId, ticket.id)))
        .toEqual([expect.objectContaining({ id: commentId, body: 'Keep this existing comment' })]);
    },
  );

  it.each(['create_ticket', 'update_ticket', 'add_comment', 'create_comment', 'update_comment'])(
    'sanitizes %s content without writing argument values to audit logs',
    async (toolName) => {
      const { owner, project, workspace, ticket, commentId, callTool } = await setupMcpTicket();
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const safeMarker = 'private-richtext-content-f7eb';
      const unsafeMarker = 'unsafe-richtext-content-b29d';
      const content = `<p>${safeMarker}</p><script>${unsafeMarker}</script>`;
      const args = toolName === 'create_ticket'
        ? { projectId: project.id, title: 'MCP audit coverage', description: content }
        : toolName === 'update_ticket'
          ? { ticketKey: ticket.key, description: content }
          : {
              ticketKey: ticket.key,
              body: content,
              ...(toolName === 'update_comment' ? { commentId } : {}),
            };

      const response = await callTool(toolName, args);

      expect(response).not.toHaveProperty('error');
      const responseText = (response as {
        result: { content: Array<{ text: string }> };
      }).result.content[0].text;
      expect(responseText).toContain(safeMarker);
      expect(responseText).not.toContain(unsafeMarker);

      const serializedLogs = infoSpy.mock.calls.map(([line]) => String(line));
      expect(serializedLogs.join('\n')).not.toContain(safeMarker);
      expect(serializedLogs.join('\n')).not.toContain(unsafeMarker);
      const executeAudit = serializedLogs
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .find((entry) => entry.event === 'mcp.tool_execute');
      expect(executeAudit).toMatchObject({
        toolName,
        workspaceId: workspace.id,
        actorUserId: owner.id,
        argumentNames: expect.arrayContaining([toolName.endsWith('ticket') ? 'description' : 'body']),
      });
      expect(executeAudit).not.toHaveProperty('arguments');
    },
  );
});
