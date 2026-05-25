import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { projects, tickets, workspaceMembers } from '../src/db/schema.js';
import {
  api,
  jsonResponse,
  readSseChunk,
  seedTicket,
  seedUser,
  seedWorkspaceFixture,
} from './helpers/test-helpers.js';

function parseMcpResult(response: { body: { result?: { content?: Array<{ text?: string }> } } }) {
  const text = response.body.result?.content?.[0]?.text;
  return JSON.parse(text ?? '{}') as unknown;
}

describe('auth, AI, MCP, webhooks, and realtime routes', () => {
  it('supports auth compatibility sign-up, sign-in, and session checks', async () => {
    const agent = request.agent(createApp());

    const signUpResponse = await agent.post('/api/auth/sign-up').send({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'super-secret-password',
    });

    expect(signUpResponse.status).toBe(200);
    expect(signUpResponse.body.user).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      tutorial_completed: 0,
    });
    expect(signUpResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/Max-Age=2592000/i)]),
    );

    const signUpSessionResponse = await agent.get('/api/auth/session');
    expect(signUpSessionResponse.status).toBe(200);
    expect(signUpSessionResponse.body.user).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      tutorial_completed: 0,
    });
    expect(signUpSessionResponse.body.session).toEqual(expect.objectContaining({
      userId: signUpResponse.body.user.id,
    }));

    const signOutResponse = await agent.post('/api/auth/sign-out').send({});
    expect(signOutResponse.status).toBe(200);
    expect(signOutResponse.body).toEqual({ success: true });

    const signedOutSessionResponse = await agent.get('/api/auth/session');
    expect(signedOutSessionResponse.status).toBe(401);
    expect(signedOutSessionResponse.body).toEqual({ error: 'Unauthorized' });

    const signInResponse = await agent.post('/api/auth/sign-in').send({
      email: 'ada@example.com',
      password: 'super-secret-password',
    });

    expect(signInResponse.status).toBe(200);
    expect(signInResponse.body.user).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(signInResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/Max-Age=2592000/i)]),
    );

    const sessionResponse = await agent.get('/api/auth/session');
    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body.user).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(sessionResponse.body.session).toEqual(expect.objectContaining({
      userId: signUpResponse.body.user.id,
    }));
  });

  it('proxies AI endpoints through fetch-backed providers', async () => {
    const fetchMock = vi
      .fn()

      // GET /ai/ollama/models — Ollama tags (non-localhost, no probe step)
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'codellama' }] }))
      // POST /ai/test-key — OpenAI models list
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'gpt-4o-mini' }] }))
      // POST /ai/test-connection — OpenAI models list
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'gpt-4o-mini' }] }))
      // POST /ai/chat (Ollama) — Ollama chat (non-localhost, no probe step)
      .mockResolvedValueOnce(jsonResponse({ message: { role: 'assistant', content: 'Hello from Ollama' } }))
      // POST /ai/chat (OpenAI cloud) — chat completions
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { role: 'assistant', content: 'Hello from GPT' } }] }),
      );

    vi.stubGlobal('fetch', fetchMock);



    const modelsResponse = await api().get('/api/v1/ai/ollama/models').query({ ollamaUrl: 'http://ollama.test' });
    expect(modelsResponse.status).toBe(200);
    expect(modelsResponse.body).toMatchObject({ connected: true, models: ['codellama'] });

    const apiKeyResponse = await api().post('/api/v1/ai/test-key').send({ provider: 'openai', apiKey: 'sk-test' });
    expect(apiKeyResponse.status).toBe(200);
    expect(apiKeyResponse.body.message).toContain('validated successfully');

    const connectionResponse = await api().post('/api/v1/ai/test-connection').send({
      provider: 'openai',
      apiKey: 'sk-test',
    });
    expect(connectionResponse.status).toBe(200);
    expect(connectionResponse.body).toMatchObject({
      connected: true,
      message: 'Connection verified successfully.',
    });

    // Ollama chat proxy (non-localhost, no probe)
    const chatResponse = await api().post('/api/v1/ai/chat').send({
      provider: 'ollama',
      ollamaUrl: 'http://ollama.test',
      model: 'llama3',
      messages: [{ role: 'user', content: 'Hello there' }],
    });
    const calledUrl = String(fetchMock.mock.calls[3][0]);
    const pathPart = calledUrl.replace(/^https?:\/\/[^/]+/, '');
    expect(pathPart).not.toContain('//');
    expect(chatResponse.status).toBe(200);
    expect(chatResponse.body).toEqual({
      message: { role: 'assistant', content: 'Hello from Ollama' },
    });

    // Cloud provider chat proxy
    const cloudChatResponse = await api().post('/api/v1/ai/chat').send({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(cloudChatResponse.status).toBe(200);
    expect(cloudChatResponse.body).toEqual({
      message: { role: 'assistant', content: 'Hello from GPT' },
    });
  });

  it('formats tools correctly for ai providers', async () => {
    const fetchMock = vi
      .fn()
      // OpenAI chat completions (with tool call)
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call_123', type: 'function', function: { name: 'list_tickets', arguments: '{}' } }] } }] }),
      )
      // Anthropic messages
      .mockResolvedValueOnce(
        jsonResponse({ content: [{ type: 'tool_use', id: 'call_123', name: 'list_tickets', input: {} }] }),
      )
      // Gemini generateContent
      .mockResolvedValueOnce(
        jsonResponse({ candidates: [{ content: { parts: [{ functionCall: { name: 'list_tickets', args: {} } }] } }] }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const tools = [{ name: 'list_tickets', description: 'Lists tickets', inputSchema: { type: 'object' } }];
    const messages = [{ role: 'user', content: 'hello' }];

    // OpenAI proxy
    const openaiChatResponse = await api().post('/api/v1/ai/chat').send({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      messages,
      tools,
    });
    expect(openaiChatResponse.status).toBe(200);
    expect(openaiChatResponse.body.message.tool_calls[0].name).toBe('list_tickets');

    // Check OpenAI tool request format
    const openaiRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(openaiRequest.tools[0].type).toBe('function');
    expect(openaiRequest.tools[0].function.name).toBe('list_tickets');

    // Anthropic proxy
    const anthropicChatResponse = await api().post('/api/v1/ai/chat').send({
      provider: 'anthropic',
      apiKey: 'sk-test',
      model: 'claude-3-haiku-20240307',
      messages,
      tools,
    });
    expect(anthropicChatResponse.status).toBe(200);
    expect(anthropicChatResponse.body.message.tool_calls[0].name).toBe('list_tickets');

    // Check Anthropic tool request format
    const anthropicRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(anthropicRequest.tools[0].name).toBe('list_tickets');
    expect(anthropicRequest.tools[0].input_schema.type).toBe('object');

    // Gemini proxy
    const geminiChatResponse = await api().post('/api/v1/ai/chat').send({
      provider: 'gemini',
      apiKey: 'sk-test',
      model: 'gemini-1.5-flash',
      messages,
      tools,
    });
    expect(geminiChatResponse.status).toBe(200);
    expect(geminiChatResponse.body.message.tool_calls[0].name).toBe('list_tickets');

    // Check Gemini tool request format
    const geminiRequest = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(geminiRequest.tools[0].functionDeclarations[0].name).toBe('list_tickets');

    vi.unstubAllGlobals();
  });
  it('handles MCP initialization, tool listing, and tool execution', async () => {
    const { owner, project, workspace } = await seedWorkspaceFixture();
    const existingTicket = await seedTicket(project.id, {
      id: 'ticket-mcp-1',
      key: `${project.key}-1`,
      title: 'Inspect MCP endpoint behavior',
      assigneeId: owner.id,
    });

    const initializeResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });

    expect(initializeResponse.status).toBe(200);
    expect(initializeResponse.body.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'gravity-mcp-server' },
    });

    const toolsResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });

    expect(toolsResponse.status).toBe(200);
    expect(toolsResponse.body.result.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'list_tickets' })]),
    );
    expect(toolsResponse.body.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'add_comment',
          inputSchema: expect.objectContaining({ required: ['ticketKey', 'body'] }),
        }),
      ]),
    );

    const createTicketResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'create_ticket',
          arguments: {
            title: 'Create ticket through MCP',
            projectId: project.id,
          },
        },
      });

    expect(createTicketResponse.status).toBe(200);
    expect(parseMcpResult(createTicketResponse)).toMatchObject({
      ticket: expect.objectContaining({
        title: 'Create ticket through MCP',
        projectId: project.id,
      }),
    });

    const listTicketsResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'list_tickets',
          arguments: { projectId: project.id },
        },
      });

    expect(listTicketsResponse.status).toBe(200);
    const ticketList = parseMcpResult(listTicketsResponse) as Array<{ key: string; title: string }>;
    expect(ticketList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: existingTicket.key, title: existingTicket.title }),
        expect.objectContaining({ title: 'Create ticket through MCP' }),
      ]),
    );

    const detailsResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'get_ticket_details',
          arguments: { ticketKey: existingTicket.key },
        },
      });

    expect(detailsResponse.status).toBe(200);
    expect(detailsResponse.body.result.content[0].text).toContain(existingTicket.title);
    
    // Assert resolved fields inside get_ticket_details response
    const detailsJson = JSON.parse(detailsResponse.body.result.content[0].text);
    expect(detailsJson.assignee).toMatchObject({
      id: owner.id,
      name: owner.name,
    });
    expect(detailsJson.project).toMatchObject({
      id: project.id,
      name: project.name,
    });

    const readDetailsResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 51,
        method: 'tools/call',
        params: {
          name: 'read_ticket_details',
          arguments: { ticketKey: existingTicket.key },
        },
      });

    expect(readDetailsResponse.status).toBe(200);
    expect(readDetailsResponse.body.result.content[0].text).toContain(existingTicket.title);
    
    const readDetailsJson = JSON.parse(readDetailsResponse.body.result.content[0].text);
    expect(readDetailsJson.assignee).toMatchObject({
      id: owner.id,
      name: owner.name,
    });
    expect(readDetailsJson.project).toMatchObject({
      id: project.id,
      name: project.name,
    });

    const updateResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'update_ticket',
          arguments: {
            ticketKey: existingTicket.key,
            status: 'in_review',
          },
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.result.content[0].text).toContain('in_review');

    const addCommentResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'add_comment',
          arguments: {
            ticketKey: existingTicket.key,
            body: 'Comment created through MCP.',
          },
        },
      });

    expect(addCommentResponse.status).toBe(200);
    expect(addCommentResponse.body.result.content[0].text).toContain('Comment created through MCP.');
    const commentData = parseMcpResult(addCommentResponse) as { comment: { id: string } };

    const readCommentsResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 71,
        method: 'tools/call',
        params: {
          name: 'read_comments',
          arguments: {
            ticketKey: existingTicket.key,
          },
        },
      });

    expect(readCommentsResponse.status).toBe(200);
    expect(readCommentsResponse.body.result.content[0].text).toContain('Comment created through MCP.');

    const updateCommentResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 715,
        method: 'tools/call',
        params: {
          name: 'update_comment',
          arguments: {
            ticketKey: existingTicket.key,
            commentId: commentData.comment.id,
            body: 'Comment updated through MCP!',
          },
        },
      });

    expect(updateCommentResponse.status).toBe(200);
    expect(updateCommentResponse.body.result.content[0].text).toContain('Comment updated through MCP!');

    const removeCommentResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 72,
        method: 'tools/call',
        params: {
          name: 'delete_comment',
          arguments: {
            ticketKey: existingTicket.key,
            commentId: commentData.comment.id,
          },
        },
      });

    expect(removeCommentResponse.status).toBe(200);
    expect(removeCommentResponse.body.result.content[0].text).toContain('"success": true');

    const listMembersResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'list_workspace_members',
          arguments: { workspaceId: workspace.id },
        },
      });

    expect(listMembersResponse.status).toBe(200);
    const membersList = parseMcpResult(listMembersResponse) as Array<{ id: string; role: string; lastActiveAt: string | null }>;
    expect(membersList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: owner.id, role: expect.any(String) }),
      ]),
    );
    expect(membersList[0]).toHaveProperty('lastActiveAt');
  });

  it('lists workspace tickets in global createdAt order across projects', async () => {
    const { owner, workspace, project } = await seedWorkspaceFixture();

    await db.insert(projects).values({
      id: 'project-2',
      workspaceId: workspace.id,
      name: 'Secondary Project',
      description: 'Secondary delivery project',
      key: 'SEC',
      status: 'active',
      inviteCode: 'INV-SEC-0002ABCD',
      createdBy: owner.id,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const laterTicket = await seedTicket(project.id, {
      id: 'ticket-later',
      key: `${project.key}-2`,
      title: 'Later primary-project ticket',
    });
    await db
      .update(tickets)
      .set({ createdAt: new Date('2025-01-02T00:00:00.000Z') })
      .where(eq(tickets.id, laterTicket.id));

    const earlierTicket = await seedTicket('project-2', {
      id: 'ticket-earlier',
      key: 'SEC-1',
      title: 'Earlier secondary-project ticket',
    });
    await db
      .update(tickets)
      .set({ createdAt: new Date('2025-01-01T00:00:00.000Z') })
      .where(eq(tickets.id, earlierTicket.id));

    const listTicketsResponse = await api().post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 401,
        method: 'tools/call',
        params: {
          name: 'list_tickets',
          arguments: {},
        },
      });

    expect(listTicketsResponse.status).toBe(200);
    const ticketList = parseMcpResult(listTicketsResponse) as Array<{ key: string }>;
    const earlierIndex = ticketList.findIndex((ticket) => ticket.key === earlierTicket.key);
    const laterIndex = ticketList.findIndex((ticket) => ticket.key === laterTicket.key);

    expect(earlierIndex).toBeGreaterThanOrEqual(0);
    expect(laterIndex).toBeGreaterThanOrEqual(0);
    expect(earlierIndex).toBeLessThan(laterIndex);
  });

  it('keeps MCP route guard failures as HTTP-native errors', async () => {
    const { owner, workspace } = await seedWorkspaceFixture();
    const stranger = await seedUser({
      id: 'mcp-stranger-1',
      name: 'Mcp Stranger',
      email: 'mcp-stranger@example.com',
      role: 'member',
    });

    const unauthenticatedResponse = await api()
      .post('/api/v1/mcp/sse')
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 501,
        method: 'tools/list',
      });

    expect(unauthenticatedResponse.status).toBe(401);
    expect(unauthenticatedResponse.body).toEqual({ error: 'Authentication required.' });

    const missingWorkspaceResponse = await api()
      .post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .send({
        jsonrpc: '2.0',
        id: 502,
        method: 'tools/list',
      });

    expect(missingWorkspaceResponse.status).toBe(400);
    expect(missingWorkspaceResponse.body).toEqual({
      error: 'X-Workspace-Id header or params.workspaceId is required.',
    });

    const unauthorizedWorkspaceResponse = await api()
      .post('/api/v1/mcp/sse')
      .set('x-user-id', stranger.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 503,
        method: 'tools/list',
      });

    expect(unauthorizedWorkspaceResponse.status).toBe(403);
    expect(unauthorizedWorkspaceResponse.body).toEqual({ error: 'Unauthorized workspace access.' });
  });

  it('updates tickets from GitHub pull request webhooks', async () => {
    const { owner, project } = await seedWorkspaceFixture();
    const ticket = await seedTicket(project.id, {
      id: 'ticket-webhook-1',
      key: `${project.key}-7`,
      title: 'Connect webhook automation',
      assigneeId: owner.id,
    });

    const webhookResponse = await api().post('/api/v1/webhooks/github').set('x-github-event', 'pull_request').send({
      action: 'opened',
      pull_request: {
        number: 42,
        title: `${ticket.key} add webhook automation`,
        head: { ref: `feature/${ticket.key.toLowerCase()}-webhook` },
        html_url: 'https://github.com/test/repo/pull/42',
        merged: false,
        user: { login: 'octocat' },
      },
    });

    expect(webhookResponse.status).toBe(200);
    expect(webhookResponse.body).toEqual({
      success: true,
      updatedTickets: [ticket.key],
    });

    const ticketResponse = await api().get(`/api/v1/tickets/${ticket.id}`).query({ projectId: project.id });
    expect(ticketResponse.status).toBe(200);
    expect(ticketResponse.body).toMatchObject({
      id: ticket.id,
      status: 'in_review',
      prStatus: 'open',
      prUrl: 'https://github.com/test/repo/pull/42',
    });
  });

  it('streams the realtime subscription init event', async () => {
    const response = await readSseChunk('/api/v1/events/subscribe');

    expect(response.statusCode).toBe(200);
    expect(String(response.headers['content-type'])).toContain('text/event-stream');
    expect(response.chunk).toContain('Connected to Gravity live stream');
    expect(response.chunk).toContain('"type":"init"');
  });

  it('enforces MCP tool disablement and strict workspace owner authorization', async () => {
    const { owner, workspace, project } = await seedWorkspaceFixture();
    const collaborator = await seedUser({
      id: 'collab-user-1',
      name: 'Collaborator',
      email: 'collab@example.com',
      role: 'member',
    });

    // Seed collaborator as a regular member in workspace
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: collaborator.id,
      role: 'member',
      createdAt: new Date(),
    });

    // 1. Unauthenticated PATCH settings is blocked
    const unauthPatch = await api()
      .patch(`/api/v1/workspaces/${workspace.id}/settings`)
      .send({ disabledMcpTools: ['list_tickets', 'create_ticket'] });
    expect(unauthPatch.status).toBe(401);

    // 2. Non-owner (collaborator) PATCH settings is blocked
    const nonOwnerPatch = await api()
      .patch(`/api/v1/workspaces/${workspace.id}/settings`)
      .set('x-user-id', collaborator.id)
      .send({ disabledMcpTools: ['list_tickets', 'create_ticket'] });
    expect(nonOwnerPatch.status).toBe(403);
    expect(nonOwnerPatch.body.error).toContain('Only workspace owners');

    // 3. Owner PATCH settings succeeds
    const ownerPatch = await api()
      .patch(`/api/v1/workspaces/${workspace.id}/settings`)
      .set('x-user-id', owner.id)
      .send({ disabledMcpTools: ['list_tickets', 'create_ticket'] });
    expect(ownerPatch.status).toBe(200);
    expect(ownerPatch.body.disabledMcpTools).toEqual(['list_tickets', 'create_ticket']);

    // 4. GET settings returns disabled list correctly
    const getSettings = await api()
      .get(`/api/v1/workspaces/${workspace.id}/settings`)
      .set('x-user-id', owner.id);
    expect(getSettings.status).toBe(200);
    expect(getSettings.body.disabledMcpTools).toEqual(['list_tickets', 'create_ticket']);

    // 5. tools/list filters out disabled tools when X-Workspace-Id header is sent
    const listFiltered = await api()
      .post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/list',
      });
    expect(listFiltered.status).toBe(200);
    const filteredTools = listFiltered.body.result.tools as Array<{ name: string }>;
    expect(filteredTools.some(t => t.name === 'list_tickets')).toBe(false);
    expect(filteredTools.some(t => t.name === 'create_ticket')).toBe(false);
    expect(filteredTools.some(t => t.name === 'get_ticket_details')).toBe(true);
    expect(filteredTools.some(t => t.name === 'read_ticket_details')).toBe(true);

    // 6. tools/call blocks calling disabled tools
    const callDisabled = await api()
      .post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'create_ticket',
          arguments: {
            title: 'Malicious Ticket',
            projectId: project.id,
          },
        },
      });
    expect(callDisabled.status).toBe(200);
    expect(callDisabled.body.error.message).toContain('disabled in this workspace');

    // 7. tools/call allows calling enabled tools
    const callEnabled = await api()
      .post('/api/v1/mcp/sse')
      .set('x-user-id', owner.id)
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'get_ticket_details',
          arguments: {
            ticketKey: 'NONEXISTENT-TICKET',
          },
        },
      });
    expect(callEnabled.status).toBe(200);
    expect(callEnabled.body.error.message).toContain('NONEXISTENT-TICKET not found');
  });
});