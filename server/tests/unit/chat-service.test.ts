import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { ChatService } from '../../src/modules/chats/services/chat-service.js';
import { db } from '../../src/db/index.js';
import { chatMessages, chatSessions, projects } from '../../src/db/schema.js';
import { createId } from '../../src/lib/platform.js';
import { seedUser, seedWorkspaceFixture } from '../helpers/test-helpers.js';
import { mcpToolsList } from '../../src/modules/mcp/tools.js';
import { env } from '../../src/env.js';
import { userSettings } from '../../src/modules/users/schema.js';

async function createChatFixture() {
  const owner = await seedUser({
    id: 'chat-service-user',
    name: 'Chat Service User',
    email: 'chat-service-user@example.com',
    role: 'owner',
    avatarUrl: 'https://example.com/avatar.png',
  });

  const { workspace, project } = await seedWorkspaceFixture({ owner });

  const projectRows = await db.select().from(projects).where(eq(projects.id, project.id)).limit(1);
  const teamId = projectRows[0]?.teamId;
  if (!teamId) {
    throw new Error('Project fixture missing team.');
  }

  const now = new Date();
  const chatId = createId('chat');
  await db.insert(chatSessions).values({
    id: chatId,
    projectId: project.id,
    teamId,
    userId: owner.id,
    title: 'New Chat',
    createdAt: now,
    updatedAt: now,
  });

  return {
    userId: owner.id,
    chatId,
    projectId: project.id,
    workspace,
    project,
  };
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function asJsonMetadata(metadata: unknown) {
  return metadata === null || typeof metadata !== 'object' ? {} : metadata as Record<string, unknown>;
}

describe('ChatService', () => {
  beforeEach(() => {
    mcpToolsList.splice(0, mcpToolsList.length);
    vi.clearAllMocks();
  });

  afterEach(() => {
    mcpToolsList.splice(0, mcpToolsList.length);
    vi.restoreAllMocks();
  });

  it('includes project context, prior messages, and available tools in the model prompt', async () => {
    const { userId, chatId, project, workspace } = await createChatFixture();
    const historyCreatedAt = new Date();
    await db.insert(chatMessages).values([
      {
        id: 'msg-history-user',
        sessionId: chatId,
        role: 'user',
        content: 'Current sprint is healthy.',
        metadata: {},
        createdAt: historyCreatedAt,
      },
      {
        id: 'msg-history-assistant',
        sessionId: chatId,
        role: 'assistant',
        content: 'Great, I noted it.',
        metadata: {},
        createdAt: new Date(historyCreatedAt.getTime() + 1000),
      },
    ]);

    mcpToolsList.push({
      name: 'list_tickets',
      description: 'List tickets with optional status filtering.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Ticket status.',
          },
        },
      },
    });

    const ai = {
      chat: vi.fn().mockResolvedValue({
        content: 'Status looks good.',
      }),
    };

    const chatService = new ChatService({ ai });
    const chunks: string[] = [];
    const response = await chatService.generateResponse({
      projectId: project.id,
      chatId,
      userId,
      message: 'What should I do next?',
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(response.content).toBe('Status looks good.');
    expect(chunks).toEqual(['Status looks good.']);

    expect(ai.chat).toHaveBeenCalledOnce();
    const [, provider, options] = (ai.chat as any).mock.calls[0];
    expect(provider).toBe('openai');
    expect(Array.isArray(options.tools)).toBe(true);
    expect(options.tools).toHaveLength(1);
    expect(options.tools?.[0]?.name).toBe('list_tickets');
    expect(options.tools?.[0]?.description).toBe('List tickets with optional status filtering.');
    expect(Array.isArray(options.messages)).toBe(true);
    expect(options.messages).toHaveLength(4);

    expect(options.messages[0].role).toBe('system');
    expect(options.messages[0].content).toContain(`Workspace: ${workspace.name} (${workspace.id})`);
    expect(options.messages[0].content).toContain(`Project: ${project.name} (${project.key})`);
    expect(options.messages[0].content).toContain('- list_tickets: List tickets with optional status filtering.');
    expect(options.messages[1]).toMatchObject({ role: 'user', content: 'Current sprint is healthy.' });
    expect(options.messages[2]).toMatchObject({ role: 'assistant', content: 'Great, I noted it.' });
    expect(options.messages[3]).toMatchObject({ role: 'user', content: 'What should I do next?' });
    expect(options.messages[3].content.length).toBeGreaterThan(0);

    const persistedMessage = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, response.assistantMessageId))
      .limit(1);
    const persistedMessages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, chatId))
      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));

    expect(persistedMessages).toHaveLength(4);
    expect(persistedMessage).toHaveLength(1);
    expect(persistedMessage[0]).toMatchObject({
      sessionId: chatId,
      role: 'assistant',
      content: 'Status looks good.',
    });
    expect(response.provider).toBe('openai');
  });

  it('does not emit synthetic chunks for providers that do not support streaming', async () => {
    const { userId, chatId, project } = await createChatFixture();

    const ai = {
      chat: vi.fn().mockResolvedValue({
        content: 'No streaming for this provider.',
      }),
    };

    const chatService = new ChatService({ ai });
    const chunks: string[] = [];
    const response = await chatService.generateResponse({
      projectId: project.id,
      chatId,
      userId,
      provider: 'anthropic',
      message: 'Can you summarize this?',
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(response.content).toBe('No streaming for this provider.');
    expect(chunks).toEqual([]);
    const [, , options] = (ai.chat as any).mock.calls[0];
    expect(options.onChunk).toBeUndefined();
  });

  it('assertStreamingProvider uses the resolved user default provider', async () => {
    const { userId, chatId } = await createChatFixture();

    await db.update(userSettings).set({ aiProvider: 'anthropic' }).where(eq(userSettings.userId, userId));

    const ai = {
      chat: vi.fn().mockResolvedValue({
        content: 'No stream for default provider.',
      }),
    };

    const chatService = new ChatService({ ai });
    await expect(chatService.assertStreamingProvider(userId)).rejects.toThrow('Unsupported provider.');
    await expect(chatService.assertStreamingProvider(userId, 'openai')).resolves.toBe('openai');
  });

  it('rejects streaming mode when provider does not support streaming', async () => {
    const { userId, chatId, project } = await createChatFixture();

    const ai = {
      chat: vi.fn().mockResolvedValue({
        content: 'Fallback should not happen.',
      }),
    };

    const chatService = new ChatService({ ai });
    await expect(
      chatService.generateResponse({
        projectId: project.id,
        chatId,
        userId,
        provider: 'anthropic',
        message: 'Can you stream this?',
        onChunk: () => Promise.resolve(),
        requireStreamingProvider: true,
      }),
    ).rejects.toThrow('Unsupported provider.');
  });

  it('does not synthesize fallback chunks after partial streaming begins', async () => {
    const { userId, chatId, project } = await createChatFixture();

    const ai = {
      chat: vi.fn().mockImplementation(async (_userId: string, _provider: string, options: { onChunk?: (chunk: string) => Promise<void> | void }) => {
        if (options.onChunk) {
          await options.onChunk('live ');
        }
        throw new Error('Provider stream interrupted');
      }),
    };

    const chatService = new ChatService({ ai });
    const chunks: string[] = [];
    const response = await chatService.generateResponse({
      projectId: project.id,
      chatId,
      userId,
      message: 'Streaming interrupted question.',
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(chunks).toEqual(['live ']);
    expect(response.fallback).toBe(true);
    expect(response.fallbackReason).toBe('provider_error');
    expect(response.content).toContain('I’m unable to produce a response right now');
  });

  it('executes MCP tools and continues the conversation after tool output', async () => {
    const { userId, chatId, project } = await createChatFixture();

    mcpToolsList.push({
      name: 'list_tickets',
      description: 'List tickets with optional status filtering.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Ticket status.',
          },
        },
      },
    });

    const ai = {
      chat: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [{ id: 'tool-1', name: 'list_tickets', arguments: { status: 'open' } }],
        })
        .mockResolvedValueOnce({
          content: 'There are 3 open tickets.',
        }),
    };

    const executeTool = vi.fn(async () => ({ result: [{ id: 'GRV-1' }, { id: 'GRV-2' }] }));

    const chatService = new ChatService({ ai, executeTool });
    const result = await chatService.generateResponse({
      projectId: project.id,
      chatId,
      userId,
      message: 'Show me open tickets.',
    });

    expect(result.content).toBe('There are 3 open tickets.');
    expect(result.fallback).toBe(false);
    expect(ai.chat).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenCalledOnce();
    expect(executeTool).toHaveBeenCalledWith('list_tickets', { status: 'open' }, expect.any(String), userId);

    const [, , toolRoundRequest] = (ai.chat as any).mock.calls[0];
    const [, , finalRequest] = (ai.chat as any).mock.calls[1];
    const toolRoundMessages = toolRoundRequest.messages;
    const finalMessages = finalRequest.messages;
    expect(toolRoundMessages).toHaveLength(2);
    expect(toolRoundMessages[0].role).toBe('system');
    expect(toolRoundMessages[1]).toMatchObject({ role: 'user', content: 'Show me open tickets.' });
    expect(finalMessages).toHaveLength(4);

    const assistantToolMessage = finalMessages.find((m: { role: string; tool_calls?: unknown[] }) => m.role === 'assistant');
    expect(assistantToolMessage?.tool_calls?.[0]).toMatchObject({
      id: 'tool-1',
      name: 'list_tickets',
      arguments: { status: 'open' },
    });

    const toolMessage = finalMessages.find((m: { role: string; tool_call_id?: string }) => m.role === 'tool');
    expect(toolMessage).toMatchObject({
      role: 'tool',
      tool_call_id: 'tool-1',
      content: JSON.stringify({ result: [{ id: 'GRV-1' }, { id: 'GRV-2' }] }),
    });

    const storedRows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, chatId))
      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
    expect(storedRows).toHaveLength(3);
    const toolOutputRows = storedRows.filter((row) => row.role === 'system' && String(row.content).startsWith('Tool output'));
    expect(toolOutputRows).toHaveLength(1);
    expect(asJsonMetadata(toolOutputRows[0].metadata).toolCall).toMatchObject({ name: 'list_tickets' });
  });

  it('returns graceful fallback text when provider times out', async () => {
    const { userId, chatId, project } = await createChatFixture();

    const ai = {
      chat: vi.fn().mockRejectedValue(new DOMException('Timed out', 'AbortError')),
    };

    const chatService = new ChatService({ ai });
    const result = await chatService.generateResponse({
      projectId: project.id,
      chatId,
      userId,
      message: 'Check status quickly.',
    });

    expect(result.fallback).toBe(true);
    expect(result.fallbackReason).toBe('timeout');
    expect(result.content).toContain('timed out');

    const storedMessages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, chatId))
      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
    const assistantMessage = storedMessages.at(-1);
    expect(assistantMessage).toMatchObject({
      role: 'assistant',
      content: result.content,
    });
    expect(asJsonMetadata(assistantMessage?.metadata).fallback).toBe(true);
  });

  it('returns graceful fallback text when request exceeds token limits', async () => {
    const { userId, chatId, project } = await createChatFixture();

    const ai = {
      chat: vi.fn().mockRejectedValue(new Error('Request exceeded context length limit')),
    };

    const chatService = new ChatService({ ai });
    const result = await chatService.generateResponse({
      projectId: project.id,
      chatId,
      userId,
      message: 'Long context request.',
    });

    expect(result.fallback).toBe(true);
    expect(result.fallbackReason).toBe('token_limit');
    expect(result.content).toContain('too large');
  });

  it('auto-generates chat titles after first user message only', async () => {
    const { userId, chatId, project } = await createChatFixture();

    const originalChunkSize = env.aiStreamChunkSize;
    env.aiStreamChunkSize = 48;

    const ai = {
      chat: vi
        .fn()
        .mockResolvedValueOnce({ content: 'This is your first response.' })
        .mockResolvedValueOnce({ content: 'Sprint Plan' })
        .mockResolvedValueOnce({ content: 'Follow-up response.' }),
    };

    const chatService = new ChatService({ ai });

    try {
      const firstTurn = await chatService.generateResponse({
        projectId: project.id,
        chatId,
        userId,
        message: 'How should we plan the sprint?',
      });
      expect(firstTurn.fallback).toBe(false);
      await flushAsync();
      await flushAsync();

      const titledSessions = await db
        .select({ id: chatSessions.id, title: chatSessions.title })
        .from(chatSessions)
        .where(eq(chatSessions.id, chatId))
        .limit(1);
      const firstSession = titledSessions[0];
      expect(firstSession?.title).toBe('Sprint Plan');

      const secondTurn = await chatService.generateResponse({
        projectId: project.id,
        chatId,
        userId,
        message: 'Give me more details.',
      });
      expect(secondTurn.fallback).toBe(false);
      await flushAsync();
      const secondSessionRows = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, chatId))
        .limit(1);
      expect(secondSessionRows).toHaveLength(1);
      expect(secondSessionRows[0].title).toBe('Sprint Plan');

      expect(ai.chat).toHaveBeenCalledTimes(3);
      expect(secondTurn.content).toBe('Follow-up response.');
      expect(secondTurn.toolCalls).toBeUndefined();
      expect(firstSession?.title).toBe(secondSessionRows[0].title);
    } finally {
      env.aiStreamChunkSize = originalChunkSize;
    }
  });
});
