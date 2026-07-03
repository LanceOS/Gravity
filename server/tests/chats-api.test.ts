import { describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { ChatService } from '../src/modules/chats/services/chat-service.js';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { chatMessages, chatSessions } from '../src/modules/chats/schema.js';
import { createId } from '../src/lib/platform.js';
import { userSettings } from '../src/modules/users/schema.js';

describe('chat sessions routes', () => {
  it('creates, lists, updates, retrieves with messages, paginates, and deletes chat sessions', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Chat Owner',
      email: 'chat-owner@example.com',
      role: 'owner',
    });
    const owner = ownerApi.user;

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
    });

    const createFirst = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Roadmap Chat' });
    expect(createFirst.status).toBe(201);
    const firstChatId = createFirst.body.id;

    const createSecond = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Release Chat' });
    expect(createSecond.status).toBe(201);
    const secondChatId = createSecond.body.id;

    const createThird = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Planning Chat' });
    expect(createThird.status).toBe(201);
    const thirdChatId = createThird.body.id;

    const sharedUpdatedAt = new Date('2026-01-01T00:00:00.000Z');
    await db
      .update(chatSessions)
      .set({ updatedAt: sharedUpdatedAt })
      .where(inArray(chatSessions.id, [firstChatId, secondChatId, thirdChatId]));

    const expectedChatOrderByUpdatedAtThenIdDesc = [firstChatId, secondChatId, thirdChatId].sort((a, b) => b.localeCompare(a));

    const firstPage = await ownerApi.get(`/api/v1/projects/${project.id}/chats`).query({ limit: 2 });
    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.body.map((chat: { id: string }) => chat.id)).toEqual(expectedChatOrderByUpdatedAtThenIdDesc.slice(0, 2));
    expect(firstPage.body[0]).toMatchObject({
      title: expect.any(String),
      projectId: project.id,
      userId: owner.id,
    });

    const secondPage = await ownerApi.get(`/api/v1/projects/${project.id}/chats`).query({ limit: 2, offset: 2 });
    expect(secondPage.status).toBe(200);
    expect(secondPage.body).toHaveLength(1);
    expect(secondPage.body.map((chat: { id: string }) => chat.id)).toEqual(
      expectedChatOrderByUpdatedAtThenIdDesc.slice(2),
    );

    expect(firstPage.body[0].id).not.toEqual(secondPage.body[0]?.id ?? '');

    const updateResponse = await ownerApi
      .patch(`/api/v1/projects/${project.id}/chats/${firstChatId}`)
      .send({ title: 'Roadmap Chat (Renamed)' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      id: firstChatId,
      title: 'Roadmap Chat (Renamed)',
    });

    const orderedList = await ownerApi.get(`/api/v1/projects/${project.id}/chats`).query({ limit: 10 });
    expect(orderedList.status).toBe(200);
    expect(orderedList.body).toHaveLength(3);
    expect(orderedList.body[0].id).toBe(firstChatId);

    const getResponse = await ownerApi.get(`/api/v1/projects/${project.id}/chats/${firstChatId}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toMatchObject({
      id: firstChatId,
      title: 'Roadmap Chat (Renamed)',
      messages: [],
    });

    const userMessage = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${firstChatId}/messages`)
      .send({
        role: 'user',
        content: 'Draft release strategy.',
        metadata: { source: 'planner', references: ['mcp://context/1'] },
      });
    expect(userMessage.status).toBe(201);
    expect(userMessage.body).toMatchObject({
      sessionId: firstChatId,
      role: 'user',
      content: 'Draft release strategy.',
      metadata: { source: 'planner', references: ['mcp://context/1'] },
    });

    const assistantMessage = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${firstChatId}/messages`)
      .send({
        role: 'assistant',
        content: 'Planned approach logged.',
        metadata: {},
      });
    expect(assistantMessage.status).toBe(201);
    expect(assistantMessage.body).toMatchObject({
      sessionId: firstChatId,
      role: 'assistant',
      content: 'Planned approach logged.',
    });

    const invalidRoleMessage = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${firstChatId}/messages`)
      .send({
        role: 'moderator',
        content: 'Invalid role should fail.',
      });
    expect(invalidRoleMessage.status).toBe(400);
    expect(invalidRoleMessage.body).toMatchObject({
      error: 'Role must be one of user, assistant, or system.',
    });

    await expect(
      db.insert(chatMessages).values({
        id: createId('msg'),
        sessionId: firstChatId,
        role: 'moderator' as unknown as 'user',
        content: 'Direct DB insertion should fail.',
        metadata: {},
        createdAt: new Date(),
      }),
    ).rejects.toBeTruthy();

    const listMetadataMessage = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${firstChatId}/messages`)
      .send({
        role: 'system',
        content: 'Context references updated.',
        metadata: ['mcp://context/2'],
      });
    expect(listMetadataMessage.status).toBe(201);
    expect(listMetadataMessage.body).toMatchObject({
      sessionId: firstChatId,
      role: 'system',
      content: 'Context references updated.',
      metadata: ['mcp://context/2'],
    });

    const getWithMessages = await ownerApi.get(`/api/v1/projects/${project.id}/chats/${firstChatId}`);
    expect(getWithMessages.status).toBe(200);
    expect(getWithMessages.body.messages).toHaveLength(3);
    expect(getWithMessages.body.messages[0].content).toBe('Draft release strategy.');
    expect(getWithMessages.body.messages[1].content).toBe('Planned approach logged.');

    const sharedMessageTime = new Date('2026-01-02T12:00:00.000Z');
    await db
      .update(chatMessages)
      .set({ createdAt: sharedMessageTime })
      .where(
        inArray(chatMessages.id, [
          userMessage.body.id,
          assistantMessage.body.id,
          listMetadataMessage.body.id,
        ]),
      );

    const getWithMessagesTiebreak = await ownerApi.get(`/api/v1/projects/${project.id}/chats/${firstChatId}`);
    expect(getWithMessagesTiebreak.status).toBe(200);
    const expectedMessageOrderByCreatedAtThenIdAsc = [userMessage.body.id, assistantMessage.body.id, listMetadataMessage.body.id].sort(
      (a, b) => a.localeCompare(b),
    );
    expect(getWithMessagesTiebreak.body.messages.map((message: { id: string }) => message.id)).toEqual(
      expectedMessageOrderByCreatedAtThenIdAsc,
    );

    const deleteResponse = await ownerApi.delete(`/api/v1/projects/${project.id}/chats/${firstChatId}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ success: true });

    const deletedGetResponse = await ownerApi.get(`/api/v1/projects/${project.id}/chats/${firstChatId}`);
    expect(deletedGetResponse.status).toBe(404);

    const remainingMessages = await db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, firstChatId))
      .limit(2);
    expect(remainingMessages).toEqual([]);

    const remainingSessions = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(eq(chatSessions.id, firstChatId))
      .limit(1);
    expect(remainingSessions).toEqual([]);

    const removedChats = await ownerApi.get(`/api/v1/projects/${project.id}/chats`).query({ limit: 10 });
    expect(removedChats.status).toBe(200);
    expect(removedChats.body).toHaveLength(2);

    // Ensure second and third chats remain unchanged
    const persistedChatIds = [secondChatId, thirdChatId];
    expect(removedChats.body.map((chat: { id: string }) => chat.id).sort()).toEqual(expect.arrayContaining(persistedChatIds));
  });

  it('filters chats by title search and includes a last message preview', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Preview Owner',
      email: 'preview-owner@example.com',
      role: 'owner',
    });
    const owner = ownerApi.user;

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
    });

    const roadmapChat = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Roadmap Planning' });
    expect(roadmapChat.status).toBe(201);
    const roadmapChatId = roadmapChat.body.id;

    const releaseChat = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Release Notes' });
    expect(releaseChat.status).toBe(201);
    const releaseChatId = releaseChat.body.id;

    const noMessagesList = await ownerApi.get(`/api/v1/projects/${project.id}/chats`);
    expect(noMessagesList.status).toBe(200);
    for (const chat of noMessagesList.body) {
      expect(chat.lastMessagePreview).toBeNull();
    }

    const longMessage = `a`.repeat(120);
    await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${roadmapChatId}/messages`)
      .send({ role: 'user', content: 'First message in roadmap chat.' });
    const latestRoadmapMessage = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${roadmapChatId}/messages`)
      .send({ role: 'assistant', content: longMessage });
    expect(latestRoadmapMessage.status).toBe(201);

    await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${releaseChatId}/messages`)
      .send({ role: 'user', content: 'Short release update.' });

    const previewList = await ownerApi.get(`/api/v1/projects/${project.id}/chats`).query({ limit: 10 });
    expect(previewList.status).toBe(200);
    const roadmapEntry = previewList.body.find((chat: { id: string }) => chat.id === roadmapChatId);
    const releaseEntry = previewList.body.find((chat: { id: string }) => chat.id === releaseChatId);
    expect(roadmapEntry.lastMessagePreview).toBe(`${'a'.repeat(80)}…`);
    expect(releaseEntry.lastMessagePreview).toBe('Short release update.');

    const searchByTitle = await ownerApi.get(`/api/v1/projects/${project.id}/chats`).query({ search: 'roadmap' });
    expect(searchByTitle.status).toBe(200);
    expect(searchByTitle.body).toHaveLength(1);
    expect(searchByTitle.body[0].id).toBe(roadmapChatId);

    const searchNoMatch = await ownerApi.get(`/api/v1/projects/${project.id}/chats`).query({ search: 'nonexistent-term' });
    expect(searchNoMatch.status).toBe(200);
    expect(searchNoMatch.body).toEqual([]);
  });

  it('restricts chat access to users who are project members', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Authorized Owner',
      email: 'authorized-owner@example.com',
      role: 'owner',
    });
    const outsiderApi = await createAuthenticatedApi({
      name: 'Unauthorized User',
      email: 'unauthorized-user@example.com',
      role: 'developer',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Private Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const listByOutsider = await outsiderApi.get(`/api/v1/projects/${project.id}/chats`);
    expect(listByOutsider.status).toBe(403);
    expect(listByOutsider.body).toEqual({ error: 'Access denied: not a member of the project.' });

    const getByOutsider = await outsiderApi
      .get(`/api/v1/projects/${project.id}/chats/${chatId}`);
    expect(getByOutsider.status).toBe(403);
    expect(getByOutsider.body).toEqual({ error: 'Access denied: not a member of the project.' });

    const unauthorizedCreate = await outsiderApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Intruder Chat' });
    expect(unauthorizedCreate.status).toBe(403);
    expect(unauthorizedCreate.body).toEqual({ error: 'Access denied: not a member of the project.' });

    const unauthorizedDelete = await outsiderApi
      .delete(`/api/v1/projects/${project.id}/chats/${chatId}`);
    expect(unauthorizedDelete.status).toBe(403);
    expect(unauthorizedDelete.body).toEqual({ error: 'Access denied: not a member of the project.' });

    const unauthorizedMessage = await outsiderApi
      .post(`/api/v1/projects/${project.id}/chats/${chatId}/messages`)
      .send({ role: 'system', content: 'Intruder' });
    expect(unauthorizedMessage.status).toBe(403);
    expect(unauthorizedMessage.body).toEqual({ error: 'Access denied: not a member of the project.' });
  });

  it('accepts SSE completion requests for providers without token streaming support', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Streaming Owner',
      email: 'stream-owner@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Streaming Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const generateSpy = vi.spyOn(ChatService.prototype, 'generateResponse').mockResolvedValue({
      assistantMessageId: 'chat-msg-stream-anthropic',
      content: 'Ready.',
      provider: 'anthropic',
      model: 'claude-3-haiku',
      toolCalls: [],
      fallback: false,
    });

    try {
      const streamResponse = await ownerApi
        .post(`/api/v1/projects/${project.id}/chats/${chatId}/stream`)
        .set('Accept', 'text/event-stream')
        .send({
          message: 'What is the current status?',
          provider: 'anthropic',
        });

      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers['content-type']).toContain('text/event-stream');
      expect(streamResponse.text).toContain(
        'data: {"type":"done","message":"Ready.","messageId":"chat-msg-stream-anthropic","provider":"anthropic","model":"claude-3-haiku","fallback":false,"toolCalls":[]}',
      );
      expect(generateSpy).toHaveBeenCalledTimes(1);
      expect(generateSpy.mock.calls[0]?.[0]).toMatchObject({
        provider: 'anthropic',
      });
      expect(generateSpy.mock.calls[0]?.[0]?.message).toBe('What is the current status?');
      expect(generateSpy.mock.calls[0]?.[0]?.onChunk).toBeUndefined();
    } finally {
      generateSpy.mockRestore();
    }
  });

  it('uses the default user provider when none is supplied', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Streaming Defaults Owner',
      email: 'stream-default-owner@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    await db
      .update(userSettings)
      .set({ aiProvider: 'anthropic' })
      .where(eq(userSettings.userId, ownerApi.user.id));

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Streaming Defaults Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const generateSpy = vi.spyOn(ChatService.prototype, 'generateResponse').mockResolvedValue({
      assistantMessageId: 'chat-msg-stream-default',
      content: 'Ready.',
      provider: 'anthropic',
      model: 'claude-3-haiku',
      toolCalls: [],
      fallback: false,
    });

    try {
      const streamResponse = await ownerApi
        .post(`/api/v1/projects/${project.id}/chats/${chatId}/stream`)
        .set('Accept', 'text/event-stream')
        .send({
          message: 'What is the current status?',
        });

      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers['content-type']).toContain('text/event-stream');
      expect(streamResponse.text).toContain(
        'data: {"type":"done","message":"Ready.","messageId":"chat-msg-stream-default","provider":"anthropic","model":"claude-3-haiku","fallback":false,"toolCalls":[]}',
      );
      expect(generateSpy).toHaveBeenCalledTimes(1);
      expect(generateSpy.mock.calls[0]?.[0]).toMatchObject({
        message: 'What is the current status?',
      });
      expect(generateSpy.mock.calls[0]?.[0]?.provider).toBeUndefined();
    } finally {
      generateSpy.mockRestore();
    }
  });

  it('rejects stream requests for unknown providers', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Streaming Unknown Provider',
      email: 'stream-unknown-provider@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Streaming Unknown Provider Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const streamResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${chatId}/stream`)
      .send({
        message: 'What is the current status?',
        provider: 'bad-provider',
      });

    expect(streamResponse.status).toBe(400);
    expect(streamResponse.body).toEqual({ error: 'Unsupported provider.' });
  });

  it('rejects stream requests when unknown provider is sent via query parameter', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Streaming Unknown Provider Query',
      email: 'stream-query-provider@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Streaming Unknown Query Provider Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const streamResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${chatId}/stream`)
      .query({ provider: 'bad-provider' })
      .send({
        message: 'What is the current status?',
      });

    expect(streamResponse.status).toBe(400);
    expect(streamResponse.body).toEqual({ error: 'Unsupported provider.' });
  });

  it('requires a non-empty message for stream requests', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Streaming Missing Message Owner',
      email: 'stream-missing-message-owner@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Streaming Missing Message Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const streamResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${chatId}/stream`)
      .send({ message: '   ' });

    expect(streamResponse.status).toBe(400);
    expect(streamResponse.body).toEqual({ error: 'Message is required.' });
  });

  it('prioritizes provider validation before message validation when provider is explicitly unsupported', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Streaming Invalid Provider Priority Owner',
      email: 'stream-invalid-provider-priority-owner@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Streaming Invalid Provider Priority Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const streamResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats/${chatId}/stream`)
      .send({
        message: '   ',
        provider: 'bad-provider',
      });

    expect(streamResponse.status).toBe(400);
    expect(streamResponse.body).toEqual({ error: 'Unsupported provider.' });
  });

  it('does not expose a GET stream generation route', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Streaming Get Owner',
      email: 'stream-get-owner@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Streaming GET Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const generateSpy = vi.spyOn(ChatService.prototype, 'generateResponse').mockResolvedValue({
      assistantMessageId: 'chat-msg-stream-get',
      content: 'Ready.',
      provider: 'openai',
      model: 'gpt-4o-mini',
      toolCalls: [],
      fallback: false,
    });

    try {
      const streamResponse = await ownerApi
        .get(`/api/v1/projects/${project.id}/chats/${chatId}/stream`)
        .query({
          message: 'What is the current status?',
          provider: 'openai',
        });

      expect(streamResponse.status).toBe(404);
      expect(generateSpy).not.toHaveBeenCalled();
    } finally {
      generateSpy.mockRestore();
    }
  });

  it('sends a completion SSE event without token chunk events', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Streaming SSE Owner',
      email: 'stream-sse-owner@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Streaming SSE Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const generateSpy = vi.spyOn(ChatService.prototype, 'generateResponse').mockImplementation(async (input) => {
      expect(input.onChunk).toBeUndefined();
      return {
        assistantMessageId: 'chat-msg-stream',
        content: 'hello friend',
        provider: 'openai',
        model: 'gpt-4o-mini',
        toolCalls: undefined,
        fallback: false,
      };
    });

    try {
      const streamResponse = await ownerApi
        .post(`/api/v1/projects/${project.id}/chats/${chatId}/stream`)
        .set('Accept', 'text/event-stream')
        .send({
          message: 'How do we ship this?',
        });

      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers['content-type']).toContain('text/event-stream');

      expect(streamResponse.text).not.toContain('"type":"chunk"');
      expect(streamResponse.text).toContain(
        'data: {"type":"done","message":"hello friend","messageId":"chat-msg-stream","provider":"openai","model":"gpt-4o-mini","fallback":false,"toolCalls":null}',
      );
      expect(generateSpy).toHaveBeenCalledTimes(1);
      expect(generateSpy.mock.calls[0]?.[0]?.message).toBe('How do we ship this?');
    } finally {
      generateSpy.mockRestore();
    }
  });

  it('accepts provider values case-insensitively for stream requests', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Streaming Case Owner',
      email: 'stream-case-owner@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Streaming Case Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const generateSpy = vi.spyOn(ChatService.prototype, 'generateResponse').mockResolvedValue({
      assistantMessageId: 'chat-msg-stream-case',
      content: 'Ready.',
      provider: 'openai',
      model: 'gpt-4o-mini',
      toolCalls: [],
      fallback: false,
    });

    try {
      const streamResponse = await ownerApi
        .post(`/api/v1/projects/${project.id}/chats/${chatId}/stream`)
        .send({
          message: 'How do we ship this?',
          provider: 'OpEnAI',
        });

      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers['content-type']).toContain('text/event-stream');
      expect(streamResponse.text).toContain(
        'data: {"type":"done","message":"Ready.","messageId":"chat-msg-stream-case","provider":"openai","model":"gpt-4o-mini","fallback":false,"toolCalls":[]}',
      );

      const call = generateSpy.mock.calls[0]?.[0];
      expect(call?.provider).toBe('openai');
      expect(call?.message).toBe('How do we ship this?');
      expect(generateSpy).toHaveBeenCalledTimes(1);
    } finally {
      generateSpy.mockRestore();
    }
  });

  it('returns stream error events when generation fails', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Streaming Failure Owner',
      email: 'stream-failure-owner@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const createResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Streaming Failure Chat' });
    expect(createResponse.status).toBe(201);
    const chatId = createResponse.body.id;

    const generateSpy = vi.spyOn(ChatService.prototype, 'generateResponse').mockRejectedValue(new Error('provider offline'));

    try {
      const streamResponse = await ownerApi
        .post(`/api/v1/projects/${project.id}/chats/${chatId}/stream`)
        .send({
          message: 'Can you run?',
        });

      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers['content-type']).toContain('text/event-stream');
      expect(streamResponse.text).toContain('data: {"type":"error","message":"provider offline"}');
      expect(streamResponse.text).not.toContain('"type":"done"');
      expect(generateSpy).toHaveBeenCalledTimes(1);
    } finally {
      generateSpy.mockRestore();
    }
  });

  it('isolates chats to the owning user within a shared project', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Project Owner',
      email: 'member-owner@example.com',
      role: 'owner',
    });
    const memberApi = await createAuthenticatedApi({
      name: 'Project Member',
      email: 'project-member@example.com',
      role: 'developer',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const addMemberResponse = await ownerApi
      .post(`/api/v1/projects/${project.id}/members`)
      .send({ userId: memberApi.user.id, role: 'developer' });
    expect(addMemberResponse.status).toBe(201);

    const ownerChat = await ownerApi
      .post(`/api/v1/projects/${project.id}/chats`)
      .send({ title: 'Owner Private Chat' });
    expect(ownerChat.status).toBe(201);
    const ownerChatId = ownerChat.body.id;

    const memberList = await memberApi.get(`/api/v1/projects/${project.id}/chats`);
    expect(memberList.status).toBe(200);
    expect(memberList.body).toEqual([]);

    const memberGet = await memberApi.get(`/api/v1/projects/${project.id}/chats/${ownerChatId}`);
    expect(memberGet.status).toBe(404);

    const memberPatch = await memberApi
      .patch(`/api/v1/projects/${project.id}/chats/${ownerChatId}`)
      .send({ title: 'Taken Ownership' });
    expect(memberPatch.status).toBe(404);

    const memberMessage = await memberApi
      .post(`/api/v1/projects/${project.id}/chats/${ownerChatId}/messages`)
      .send({ role: 'user', content: 'This should not work.' });
    expect(memberMessage.status).toBe(404);

    const memberDelete = await memberApi.delete(`/api/v1/projects/${project.id}/chats/${ownerChatId}`);
    expect(memberDelete.status).toBe(404);

    const ownerGet = await ownerApi.get(`/api/v1/projects/${project.id}/chats/${ownerChatId}`);
    expect(ownerGet.status).toBe(200);
  });
});
