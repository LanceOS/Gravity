import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { chatMessages, chatSessions } from '../src/modules/chats/schema.js';
import { createId } from '../src/lib/platform.js';

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

    const firstPage = await ownerApi.get(`/api/v1/projects/${project.id}/chats`).query({ limit: 2 });
    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.body[0]).toMatchObject({
      title: expect.any(String),
      projectId: project.id,
      userId: owner.id,
    });

    const secondPage = await ownerApi.get(`/api/v1/projects/${project.id}/chats`).query({ limit: 2, offset: 2 });
    expect(secondPage.status).toBe(200);
    expect(secondPage.body).toHaveLength(1);

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
