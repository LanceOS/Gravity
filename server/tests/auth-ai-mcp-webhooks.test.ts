import { eq } from 'drizzle-orm';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { labels, projects, tickets, workspaceMembers } from '../src/db/schema.js';
import { getDefaultTeamId } from '../src/modules/workspaces/utils/default-team.js';
import { mcpEventBus, type McpMutationEvent } from '../src/lib/mcp-event-bus.js';
import {
  api as baseApi,
  createAuthenticatedApi,
  jsonResponse,
  readSseChunk,
  seedTicket,
  seedUser,
  seedWorkspaceFixture,
} from './helpers/test-helpers.js';

let authenticatedAiApi: Awaited<ReturnType<typeof createAuthenticatedApi>>;

function api() {
  return authenticatedAiApi;
}

function parseMcpResult(response: { body: { result?: { content?: Array<{ text?: string }> } } }) {
  const text = response.body.result?.content?.[0]?.text;
  return JSON.parse(text ?? '{}') as unknown;
}

describe('auth, AI, MCP, webhooks, and realtime routes', () => {
  beforeEach(async () => {
    process.env.OPENAI_API_KEY = 'env-openai-test-key';
    process.env.ANTHROPIC_API_KEY = 'env-anthropic-test-key';
    process.env.GEMINI_API_KEY = 'env-gemini-test-key';
    process.env.DEEPSEEK_API_KEY = 'env-deepseek-test-key';
    authenticatedAiApi = await createAuthenticatedApi({
      name: 'Mock User',
      email: 'mockuser@example.com',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
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
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace-mcp@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/grace.png',
    });
    const owner = ownerApi.user;
    const { project, workspace } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
    });
    const existingTicket = await seedTicket(project.id, {
      id: 'ticket-mcp-1',
      key: `${project.key}-1`,
      title: 'Inspect MCP endpoint behavior',
      assigneeId: owner.id,
    });

    const ownerMcpRequest = (payload: Record<string, unknown>) =>
      ownerApi.post('/api/v1/mcp/sse').set('X-Workspace-Id', workspace.id).send(payload);

    const initializeResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });

    expect(initializeResponse.status).toBe(200);
    expect(initializeResponse.body.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'gravity-mcp-server' },
    });

    const toolsResponse = await ownerMcpRequest({
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
    expect(toolsResponse.body.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'add_ticket_dependency' }),
        expect.objectContaining({ name: 'remove_ticket_dependency' }),
      ]),
    );

    const createTicketResponse = await ownerMcpRequest({
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

    const listTicketsResponse = await ownerMcpRequest({
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

    const detailsResponse = await ownerMcpRequest({
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

    const readDetailsResponse = await ownerMcpRequest({
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

    const updateResponse = await ownerMcpRequest({
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

    const addCommentResponse = await ownerMcpRequest({
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

    const readCommentsResponse = await ownerMcpRequest({
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

    const updateCommentResponse = await ownerMcpRequest({
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

    const removeCommentResponse = await ownerMcpRequest({
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

    const createWithTimestampsResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 75,
        method: 'tools/call',
        params: {
          name: 'create_ticket',
          arguments: {
            title: 'Migrated Ticket',
            projectId: project.id,
            createdAt: '2023-01-01T12:00:00Z',
            updatedAt: '2023-01-02T12:00:00Z',
          },
        },
      });

    expect(createWithTimestampsResponse.status).toBe(200);
    const migratedTicket = parseMcpResult(createWithTimestampsResponse) as { ticket: { createdAt: string; updatedAt: string } };
    expect(migratedTicket.ticket.createdAt).toBe(new Date('2023-01-01T12:00:00Z').toISOString());
    expect(migratedTicket.ticket.updatedAt).toBe(new Date('2023-01-02T12:00:00Z').toISOString());

    const listMembersResponse = await ownerMcpRequest({
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

  it('emits MCP mutation events for all mutation handlers on success', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace-mcp-events@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/grace.png',
    });
    const owner = ownerApi.user;
    const { workspace, project } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        avatarUrl: owner.avatar,
      },
    });
    const teamId = getDefaultTeamId(workspace.id);

    const ownerMcpRequest = (payload: Record<string, unknown>) =>
      ownerApi.post('/api/v1/mcp/sse').set('X-Workspace-Id', workspace.id).send(payload);

    const emittedEvents: McpMutationEvent[] = [];
    const unsubscribe = mcpEventBus.subscribe(workspace.id, (event) => emittedEvents.push(event));

    const parentTicket = await seedTicket(project.id, {
      id: 'ticket-parent',
      key: `${project.key}-10`,
      title: 'Parent ticket',
    });

    await db.insert(labels).values([
      {
        id: 'label-primary',
        teamId,
        projectId: project.id,
        name: 'Frontend',
        color: '#7c3aed',
        description: 'Frontend work',
        sortOrder: 0,
      },
      {
        id: 'label-secondary',
        teamId,
        projectId: project.id,
        name: 'Backend',
        color: '#2563eb',
        description: 'Backend work',
        sortOrder: 1,
      },
    ]);

    const parentTicket2 = await seedTicket(project.id, {
      id: 'ticket-dependency',
      key: `${project.key}-11`,
      title: 'Dependency ticket',
    });
    const parentTicket3 = await seedTicket(project.id, {
      id: 'ticket-dependency-alt',
      key: `${project.key}-12`,
      title: 'Alternate dependency ticket',
    });

    const mutationBase = {
      workspaceId: workspace.id,
      projectId: project.id,
      teamId,
      actorUserId: owner.id,
    };

    try {
      const createResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'create_ticket',
          arguments: {
            title: 'Create regular ticket',
            projectId: project.id,
          },
        },
      });
      expect(createResponse.status).toBe(200);
      const createResult = parseMcpResult(createResponse) as { ticket: { key: string } };
      expect(createResult.ticket.key).toBeDefined();
      const createTicketEvents = emittedEvents.slice(-1);

      expect(createTicketEvents).toHaveLength(1);
      expect(createTicketEvents[0]).toMatchObject({
        ...mutationBase,
        type: 'ticket.created',
        ticketKey: createResult.ticket.key,
      });

      const createSubtaskResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'create_ticket',
          arguments: {
            title: 'Create sub-task ticket',
            projectId: project.id,
            parentId: parentTicket.id,
          },
        },
      });
      expect(createSubtaskResponse.status).toBe(200);
      const createSubtaskResult = parseMcpResult(createSubtaskResponse) as { ticket: { key: string } };
      const subtaskEvents = emittedEvents.slice(-2);

      expect(subtaskEvents).toHaveLength(2);
      expect(subtaskEvents[0]).toMatchObject({
        ...mutationBase,
        type: 'ticket.created',
        ticketKey: createSubtaskResult.ticket.key,
      });
      expect(subtaskEvents[1]).toMatchObject({
        ...mutationBase,
        type: 'subtask.created',
        ticketKey: createSubtaskResult.ticket.key,
        data: { parentId: parentTicket.id },
      });

      const updateResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 22,
        method: 'tools/call',
        params: {
          name: 'update_ticket',
          arguments: {
            ticketKey: createResult.ticket.key,
            status: 'in_review',
          },
        },
      });
      expect(updateResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'ticket.updated',
        ticketKey: createResult.ticket.key,
      });

      const addCommentResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 23,
        method: 'tools/call',
        params: {
          name: 'add_comment',
          arguments: {
            ticketKey: createResult.ticket.key,
            body: 'Added via MCP',
          },
        },
      });
      expect(addCommentResponse.status).toBe(200);
      const addCommentResult = parseMcpResult(addCommentResponse) as { comment: { id: string } };
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'comment.added',
        ticketKey: createResult.ticket.key,
        data: { commentId: addCommentResult.comment.id },
      });

      const createCommentResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 24,
        method: 'tools/call',
        params: {
          name: 'create_comment',
          arguments: {
            ticketKey: createResult.ticket.key,
            body: 'Created via MCP create_comment alias',
          },
        },
      });
      expect(createCommentResponse.status).toBe(200);
      const createAliasCommentResult = parseMcpResult(createCommentResponse) as { comment: { id: string } };
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'comment.added',
        ticketKey: createResult.ticket.key,
        data: { commentId: createAliasCommentResult.comment.id },
      });

      const updateCommentResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 25,
        method: 'tools/call',
        params: {
          name: 'update_comment',
          arguments: {
            ticketKey: createResult.ticket.key,
            commentId: addCommentResult.comment.id,
            body: 'Updated via MCP',
          },
        },
      });
      expect(updateCommentResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'comment.updated',
        ticketKey: createResult.ticket.key,
        data: { commentId: addCommentResult.comment.id },
      });

      const deleteCommentResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 26,
        method: 'tools/call',
        params: {
          name: 'delete_comment',
          arguments: {
            ticketKey: createResult.ticket.key,
            commentId: addCommentResult.comment.id,
          },
        },
      });
      expect(deleteCommentResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'comment.deleted',
        ticketKey: createResult.ticket.key,
        data: { commentId: addCommentResult.comment.id },
      });

      const addLabelsResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 27,
        method: 'tools/call',
        params: {
          name: 'add_ticket_labels',
          arguments: {
            ticketKey: createResult.ticket.key,
            labels: 'Frontend',
          },
        },
      });
      expect(addLabelsResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'labels.added',
        ticketKey: createResult.ticket.key,
        data: { addedLabels: ['Frontend'], finalLabels: ['Frontend'] },
      });

      const setLabelsResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 28,
        method: 'tools/call',
        params: {
          name: 'set_ticket_labels',
          arguments: {
            ticketKey: createResult.ticket.key,
            labels: 'Frontend,Backend',
          },
        },
      });
      expect(setLabelsResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'labels.set',
        ticketKey: createResult.ticket.key,
        data: { labels: ['Frontend', 'Backend'] },
      });

      const removeLabelsResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 29,
        method: 'tools/call',
        params: {
          name: 'remove_ticket_labels',
          arguments: {
            ticketKey: createResult.ticket.key,
            labels: 'Frontend',
          },
        },
      });
      expect(removeLabelsResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'labels.removed',
        ticketKey: createResult.ticket.key,
        data: { removedLabels: ['Frontend'] },
      });

      const addDependencyResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: {
          name: 'add_dependency',
          arguments: {
            ticketKey: createResult.ticket.key,
            dependencyTicketKey: parentTicket2.key,
          },
        },
      });
      expect(addDependencyResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'dependency.added',
        ticketKey: createResult.ticket.key,
        data: { dependencyTicketKey: parentTicket2.key },
      });

      const removeDependencyResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'remove_dependency',
          arguments: {
            ticketKey: createResult.ticket.key,
            dependencyTicketKey: parentTicket2.key,
          },
        },
      });
      expect(removeDependencyResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'dependency.removed',
        ticketKey: createResult.ticket.key,
        data: { dependencyTicketKey: parentTicket2.key },
      });

      const addDependencyAliasResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 32,
        method: 'tools/call',
        params: {
          name: 'add_ticket_dependency',
          arguments: {
            ticketKey: createResult.ticket.key,
            dependencyTicketKey: parentTicket3.key,
          },
        },
      });
      expect(addDependencyAliasResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'dependency.added',
        ticketKey: createResult.ticket.key,
        data: { dependencyTicketKey: parentTicket3.key },
      });

      const removeDependencyAliasResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 33,
        method: 'tools/call',
        params: {
          name: 'remove_ticket_dependency',
          arguments: {
            ticketKey: createResult.ticket.key,
            dependencyTicketKey: parentTicket3.key,
          },
        },
      });
      expect(removeDependencyAliasResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'dependency.removed',
        ticketKey: createResult.ticket.key,
        data: { dependencyTicketKey: parentTicket3.key },
      });

      const deleteTicketResponse = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 34,
        method: 'tools/call',
        params: {
          name: 'delete_ticket',
          arguments: {
            ticketKey: createResult.ticket.key,
          },
        },
      });
      expect(deleteTicketResponse.status).toBe(200);
      expect(emittedEvents.slice(-1)[0]).toMatchObject({
        ...mutationBase,
        type: 'ticket.deleted',
        ticketKey: createResult.ticket.key,
        data: { ticketId: expect.any(String) },
      });
    } finally {
      unsubscribe();
    }
  });

  it('does not emit MCP mutation events when a mutation fails', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace-mcp-events-fail@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/grace.png',
    });
    const owner = ownerApi.user;
    const { workspace, project } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        avatarUrl: owner.avatar,
      },
    });

    const ownerMcpRequest = (payload: Record<string, unknown>) =>
      ownerApi.post('/api/v1/mcp/sse').set('X-Workspace-Id', workspace.id).send(payload);

    const blockerTicket = await seedTicket(project.id, {
      id: 'ticket-failed-src',
      key: `${project.key}-20`,
      title: 'Dependency source',
    });
    const blockedTicket = await seedTicket(project.id, {
      id: 'ticket-failed-target',
      key: `${project.key}-21`,
      title: 'Dependency target',
    });

    const emittedEvents: McpMutationEvent[] = [];
    const unsubscribe = mcpEventBus.subscribe(workspace.id, (event) => emittedEvents.push(event));

    try {
      const firstAdd = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: {
          name: 'add_dependency',
          arguments: {
            ticketKey: blockerTicket.key,
            dependencyTicketKey: blockedTicket.key,
          },
        },
      });
      expect(firstAdd.status).toBe(200);

      const eventCountBeforeFailure = emittedEvents.length;

      const duplicateAdd = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'add_ticket_dependency',
          arguments: {
            ticketKey: blockerTicket.key,
            dependencyTicketKey: blockedTicket.key,
          },
        },
      });
      expect(duplicateAdd.status).toBe(200);
      expect(duplicateAdd.body.error?.message).toContain('already blocks the selected ticket');
      expect(emittedEvents).toHaveLength(eventCountBeforeFailure);
    } finally {
      unsubscribe();
    }
  });

  it('does not emit MCP mutation events when label mutation validation fails', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace-mcp-events-fail-labels@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/grace.png',
    });
    const owner = ownerApi.user;
    const { workspace, project } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        avatarUrl: owner.avatar,
      },
    });

    const ownerMcpRequest = (payload: Record<string, unknown>) =>
      ownerApi.post('/api/v1/mcp/sse').set('X-Workspace-Id', workspace.id).send(payload);

    const targetTicket = await seedTicket(project.id, {
      id: 'ticket-label-fail',
      key: `${project.key}-30`,
      title: 'Label failure target',
    });

    const emittedEvents: McpMutationEvent[] = [];
    const unsubscribe = mcpEventBus.subscribe(workspace.id, (event) => emittedEvents.push(event));

    try {
      const setLabelsFailure = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 33,
        method: 'tools/call',
        params: {
          name: 'set_ticket_labels',
          arguments: {
            ticketKey: targetTicket.key,
            labels: 'DoesNotExist',
          },
        },
      });
      expect(setLabelsFailure.status).toBe(200);
      expect(setLabelsFailure.body.error?.message).toContain('do not exist');
      expect(emittedEvents).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  });

  it('lists workspace tickets in global createdAt order across projects', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace-mcp-order@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/grace.png',
    });
    const owner = ownerApi.user;
    const { workspace, project } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
    });

    const ownerMcpRequest = (payload: Record<string, unknown>) =>
      ownerApi.post('/api/v1/mcp/sse').set('X-Workspace-Id', workspace.id).send(payload);

    await db.insert(projects).values({
      id: 'project-2',
      workspaceId: workspace.id,
      teamId: getDefaultTeamId(workspace.id),
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

    const listTicketsResponse = await ownerMcpRequest({
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
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace-mcp-guard@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/grace.png',
    });
    const owner = ownerApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
    });
    const strangerApi = await createAuthenticatedApi({
      name: 'Mcp Stranger',
      email: 'mcp-stranger@example.com',
      role: 'member',
    });

    const unauthenticatedResponse = await baseApi()
      .post('/api/v1/mcp/sse')
      .set('X-Workspace-Id', workspace.id)
      .send({
        jsonrpc: '2.0',
        id: 501,
        method: 'tools/list',
      });

    expect(unauthenticatedResponse.status).toBe(401);
    expect(unauthenticatedResponse.body).toEqual({ error: 'Authentication required.' });

    const missingWorkspaceResponse = await ownerApi
      .post('/api/v1/mcp/sse')
      .send({
        jsonrpc: '2.0',
        id: 502,
        method: 'tools/list',
      });

    expect(missingWorkspaceResponse.status).toBe(400);
    expect(missingWorkspaceResponse.body).toEqual({
      error: 'X-Workspace-Id header or params.workspaceId is required.',
    });

    const unauthorizedWorkspaceResponse = await strangerApi
      .post('/api/v1/mcp/sse')
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
    const ownerApi = await createAuthenticatedApi({
      name: 'Test Owner',
      email: 'test-webhook@example.com',
    });
    const { owner, project } = await seedWorkspaceFixture({
      owner: { id: ownerApi.user.id, name: ownerApi.user.name, email: ownerApi.user.email, role: 'owner' }
    });
    await db.update(projects).set({ githubRepoUrl: 'https://github.com/test/repo' }).where(eq(projects.id, project.id));

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
      repository: {
        html_url: 'https://github.com/test/repo',
      },
    });

    expect(webhookResponse.status).toBe(200);
    expect(webhookResponse.body).toEqual({
      success: true,
    });

    const ticketResponse = await ownerApi.get(`/api/v1/tickets/${ticket.id}`);
    expect(ticketResponse.status).toBe(200);
    expect(ticketResponse.body).toMatchObject({
      id: ticket.id,
      status: 'in_progress',
      prStatus: 'open',
      prUrl: 'https://github.com/test/repo/pull/42',
    });
  });

  it('streams the realtime subscription init event', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'SSE Stream Owner',
      email: 'sse-stream-owner@example.com',
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

    const response = await readSseChunk(`/api/v1/events/subscribe?workspaceId=${workspace.id}`, {
      headers: { Cookie: ownerApi.sessionCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.headers['content-type'])).toContain('text/event-stream');
    expect(response.chunk).toContain('Connected to Gravity live stream');
    expect(response.chunk).toContain('"type":"init"');
  });

  it('enforces MCP tool disablement and strict workspace owner authorization', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace-mcp-disable@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/grace.png',
    });
    const owner = ownerApi.user;
    const { workspace, project } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
    });
    const collaboratorApi = await createAuthenticatedApi({
      name: 'Collaborator',
      email: 'collab@example.com',
      role: 'member',
    });
    const collaborator = collaboratorApi.user;

    const ownerMcpRequest = (payload: Record<string, unknown>) =>
      ownerApi.post('/api/v1/mcp/sse').set('X-Workspace-Id', workspace.id).send(payload);

    // Seed collaborator as a regular member in workspace
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: collaborator.id,
      role: 'member',
      createdAt: new Date(),
    });

    // 1. Unauthenticated PATCH settings is blocked
    const unauthPatch = await baseApi()
      .patch(`/api/v1/workspaces/${workspace.id}/settings`)
      .send({ disabledMcpTools: ['list_tickets', 'create_ticket'] });
    expect(unauthPatch.status).toBe(401);

    // 2. Non-owner (collaborator) PATCH settings is blocked
    const nonOwnerPatch = await collaboratorApi
      .patch(`/api/v1/workspaces/${workspace.id}/settings`)
      .send({ disabledMcpTools: ['list_tickets', 'create_ticket'] });
    expect(nonOwnerPatch.status).toBe(403);
    expect(nonOwnerPatch.body.error).toContain('Only workspace owners');

    // 3. Owner PATCH settings succeeds
    const ownerPatch = await ownerApi
      .patch(`/api/v1/workspaces/${workspace.id}/settings`)
      .send({ disabledMcpTools: ['list_tickets', 'create_ticket', 'add_ticket_dependency'] });
    expect(ownerPatch.status).toBe(200);
    expect(ownerPatch.body.disabledMcpTools).toEqual(
      expect.arrayContaining(['list_tickets', 'create_ticket', 'add_ticket_dependency']),
    );

    // 4. GET settings returns disabled list correctly
    const getSettings = await ownerApi.get(`/api/v1/workspaces/${workspace.id}/settings`);
    expect(getSettings.status).toBe(200);
    expect(getSettings.body.disabledMcpTools).toEqual(
      expect.arrayContaining(['list_tickets', 'create_ticket', 'add_ticket_dependency']),
    );

    // 5. tools/list filters out disabled tools when X-Workspace-Id header is sent
    const listFiltered = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/list',
      });
    expect(listFiltered.status).toBe(200);
    const filteredTools = listFiltered.body.result.tools as Array<{ name: string }>;
    expect(filteredTools.some(t => t.name === 'list_tickets')).toBe(false);
    expect(filteredTools.some(t => t.name === 'create_ticket')).toBe(false);
    expect(filteredTools.some(t => t.name === 'add_dependency')).toBe(false);
    expect(filteredTools.some(t => t.name === 'add_ticket_dependency')).toBe(false);
    expect(filteredTools.some(t => t.name === 'get_ticket_details')).toBe(true);
    expect(filteredTools.some(t => t.name === 'read_ticket_details')).toBe(true);

    // 6. tools/call blocks calling disabled tools
    const callDisabled = await ownerMcpRequest({
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

    // 6b. add_ticket_dependency alias is blocked when add_dependency is equivalent.
    const callDisabledAlias = await ownerMcpRequest({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'add_ticket_dependency',
        arguments: {
          ticketKey: 'N/A',
          dependencyTicketKey: 'N/A',
        },
      },
    });
    expect(callDisabledAlias.status).toBe(200);
    expect(callDisabledAlias.body.error.message).toContain('disabled in this workspace');

    // 7. tools/call allows calling enabled tools
    const callEnabled = await ownerMcpRequest({
        jsonrpc: '2.0',
        id: 13,
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
