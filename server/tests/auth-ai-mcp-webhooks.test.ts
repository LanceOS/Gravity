import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  api,
  jsonResponse,
  readSseChunk,
  seedTicket,
  seedWorkspaceFixture,
} from './helpers/test-helpers.js';

function parseMcpResult(response: { body: { result?: { content?: Array<{ text?: string }> } } }) {
  const text = response.body.result?.content?.[0]?.text;
  return JSON.parse(text ?? '{}') as Record<string, unknown>;
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
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'llama3' }] }))
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'codellama' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'gpt-4o-mini' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'gpt-4o-mini' }] }))
      .mockResolvedValueOnce(jsonResponse({ message: { role: 'assistant', content: 'Hello from Ollama' } }));

    vi.stubGlobal('fetch', fetchMock);

    const legacyModelsResponse = await api().get('/api/v1/ollama/models').query({ ollamaUrl: 'http://ollama.test' });
    expect(legacyModelsResponse.status).toBe(200);
    expect(legacyModelsResponse.body).toEqual(['llama3']);

    const modelsResponse = await api().get('/api/v1/ai/ollama/models').query({ ollamaUrl: 'http://ollama.test' });
    expect(modelsResponse.status).toBe(200);
    expect(modelsResponse.body).toEqual(['codellama']);

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

    const chatResponse = await api().post('/api/v1/ai/chat').send({
      ollamaUrl: 'http://ollama.test',
      model: 'llama3',
      messages: [{ role: 'user', content: 'Hello there' }],
    });

    expect(chatResponse.status).toBe(200);
    expect(chatResponse.body).toEqual({
      message: {
        role: 'assistant',
        content: 'Hello from Ollama',
      },
    });
  });

  it('handles MCP initialization, tool listing, and tool execution', async () => {
    const { owner, project } = await seedWorkspaceFixture();
    const existingTicket = await seedTicket(project.id, {
      id: 'ticket-mcp-1',
      key: `${project.key}-1`,
      title: 'Inspect MCP endpoint behavior',
      assigneeId: owner.id,
    });

    const initializeResponse = await api().post('/api/v1/mcp/sse').send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });

    expect(initializeResponse.status).toBe(200);
    expect(initializeResponse.body.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'gravity-mcp-server' },
    });

    const toolsResponse = await api().post('/api/v1/mcp/sse').send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    expect(toolsResponse.status).toBe(200);
    expect(toolsResponse.body.result.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'list_tickets' })]),
    );

    const createTicketResponse = await api().post('/api/v1/mcp/sse').send({
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

    const listTicketsResponse = await api().post('/api/v1/mcp/sse').send({
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

    const detailsResponse = await api().post('/api/v1/mcp/sse').send({
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

    const updateResponse = await api().post('/api/v1/mcp/sse').send({
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

    const addCommentResponse = await api().post('/api/v1/mcp/sse').send({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'add_comment',
        arguments: {
          ticketKey: existingTicket.key,
          userId: owner.id,
          body: 'Comment created through MCP.',
        },
      },
    });

    expect(addCommentResponse.status).toBe(200);
    expect(addCommentResponse.body.result.content[0].text).toContain('Comment created through MCP.');
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
});