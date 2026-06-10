import { describe, expect, it } from 'vitest';
import {
  api,
  createAuthenticatedApi,
  seedCycle,
  seedDomain,
  seedTicket,
  seedUser,
  seedWorkspaceFixture,
} from './helpers/test-helpers.js';

describe('projects and tickets routes', () => {
  it('lists, creates, updates, and shares projects', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace@example.com',
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
    const domain = await seedDomain(project.id, { id: 'domain-1', name: 'Frontend', color: '#2563EB' });
    const cycle = await seedCycle(project.id, {
      id: 'cycle-1',
      name: 'Sprint 7',
      startDate: new Date('2025-01-03T00:00:00.000Z'),
      endDate: new Date('2025-01-10T00:00:00.000Z'),
    });

    const listResponse = await ownerApi
      .get('/api/v1/projects')
      .query({ userId: owner.id, workspaceId: workspace.id });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: project.id,
        name: project.name,
        workspaceId: workspace.id,
        domains: [{ id: domain.id, name: domain.name, color: domain.color }],
        cycles: [
          expect.objectContaining({
            id: cycle.id,
            name: cycle.name,
          }),
        ],
      }),
    ]);

    const createResponse = await api().post('/api/v1/projects').send({
      name: 'Console API',
      description: 'Workspace automation API',
      key: 'CON',
      status: 'active',
      ownerId: owner.id,
      workspaceId: workspace.id,
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      name: 'Console API',
      key: 'CON',
      workspaceId: workspace.id,
      status: 'active',
    });
    expect(createResponse.body.inviteCode).toEqual(expect.any(String));

    const patchResponse = await api().patch(`/api/v1/projects/${createResponse.body.id}`).send({
      name: 'Console API v2',
      status: 'paused',
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      id: createResponse.body.id,
      name: 'Console API v2',
      status: 'paused',
    });

    const member = await seedUser({
      id: 'user-2',
      name: 'Linus Torvalds',
      email: 'linus@example.com',
      role: 'developer',
      avatarUrl: 'https://example.com/linus.png',
    });

    const addMemberResponse = await api().post(`/api/v1/projects/${createResponse.body.id}/members`).send({
      userId: member.id,
      role: 'developer',
    });

    expect(addMemberResponse.status).toBe(201);
    expect(addMemberResponse.body).toEqual({ success: true });

    const collaborator = await seedUser({
      id: 'user-3',
      name: 'Margaret Hamilton',
      email: 'margaret@example.com',
      role: 'developer',
      avatarUrl: 'https://example.com/margaret.png',
    });

    const inviteAcceptResponse = await api().post('/api/v1/projects/invite/accept').send({
      inviteCode: createResponse.body.inviteCode,
      userId: collaborator.id,
    });

    expect(inviteAcceptResponse.status).toBe(200);
    expect(inviteAcceptResponse.body.project).toMatchObject({
      id: createResponse.body.id,
      workspaceId: workspace.id,
      key: 'CON',
    });
  });

  it('manages tickets, comments, domains, and cycles', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Test Owner',
      email: 'test@example.com',
      role: 'owner',
    });
    const { owner, workspace, project } = await seedWorkspaceFixture({
      owner: { id: ownerApi.user.id, name: ownerApi.user.name, email: ownerApi.user.email, role: 'owner', avatarUrl: ownerApi.user.avatar }
    });

    const domain = await seedDomain(project.id, { id: 'domain-1', name: 'Platform', color: '#0F766E' });

    const createLabelResponse = await ownerApi.post('/api/v1/labels').send({
      projectId: project.id,
      name: 'Platform Label',
      color: '#0F766E',
    });

    expect(createLabelResponse.status).toBe(201);

    const listLabelsResponse = await ownerApi.get('/api/v1/labels').query({ projectId: project.id });
    expect(listLabelsResponse.status).toBe(200);
    expect(listLabelsResponse.body).toEqual([
      expect.objectContaining({
        id: createLabelResponse.body.id,
        name: 'Platform Label',
        color: '#0F766E',
      }),
    ]);

    const createCycleResponse = await ownerApi.post('/api/v1/cycles').send({
      projectId: project.id,
      name: 'Sprint Alpha',
      startDate: '2025-01-15T00:00:00.000Z',
      endDate: '2025-01-22T00:00:00.000Z',
    });

    expect(createCycleResponse.status).toBe(201);

    const listCyclesResponse = await ownerApi.get('/api/v1/cycles').query({ projectId: project.id });
    expect(listCyclesResponse.status).toBe(200);
    expect(listCyclesResponse.body).toEqual([
      expect.objectContaining({
        id: createCycleResponse.body.id,
        name: 'Sprint Alpha',
      }),
    ]);

    const createTicketResponse = await ownerApi.post('/api/v1/tickets').send({
      projectId: project.id,
      title: 'Ship server endpoint coverage',
      description: 'Cover every route with pg-mem-backed tests.',
      domainId: domain.id,
      cycleId: createCycleResponse.body.id,
      assigneeId: owner.id,
      priority: 'high',
    });

    expect(createTicketResponse.status).toBe(201);
    expect(createTicketResponse.body).toMatchObject({
      title: 'Ship server endpoint coverage',
      projectId: project.id,
      domainId: domain.id,
      cycleId: createCycleResponse.body.id,
      assigneeId: owner.id,
    });

    const listTicketsResponse = await ownerApi.get('/api/v1/tickets').query({ projectId: project.id });
    expect(listTicketsResponse.status).toBe(200);
    expect(listTicketsResponse.body).toEqual([
      expect.objectContaining({
        id: createTicketResponse.body.id,
        title: 'Ship server endpoint coverage',
      }),
    ]);

    const detailResponse = await ownerApi
      .get(`/api/v1/tickets/${createTicketResponse.body.id}`)
      .query({ projectId: project.id });
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toMatchObject({
      id: createTicketResponse.body.id,
      title: 'Ship server endpoint coverage',
    });

    const patchResponse = await ownerApi
      .patch(`/api/v1/tickets/${createTicketResponse.body.id}`)
      .set('x-project-id', project.id)
      .send({ status: 'in_review', prStatus: 'open' });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      id: createTicketResponse.body.id,
      status: 'in_review',
      prStatus: 'open',
    });

    const ownerCommentResponse = await ownerApi.post(`/api/v1/tickets/${createTicketResponse.body.id}/comments`).send({
      userId: owner.id,
      body: 'First pass ready.',
    });

    expect(ownerCommentResponse.status).toBe(201);
    expect(ownerCommentResponse.body).toMatchObject({
      ticketId: createTicketResponse.body.id,
      userId: owner.id,
      body: 'First pass ready.',
    });

    const listCommentsResponse = await ownerApi
      .get(`/api/v1/tickets/${createTicketResponse.body.id}/comments`);

    expect(listCommentsResponse.status).toBe(200);
    expect(listCommentsResponse.body).toHaveLength(1);

    const deleteResponse = await ownerApi
      .delete(`/api/v1/tickets/${createTicketResponse.body.id}`)
      .query({ projectId: project.id });

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ success: true });
  });

  it('resolves ticket details by its key prefix/key and validates access', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace-key@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/grace.png',
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
    const ticket = await seedTicket(project.id, {
      id: 'ticket-99',
      title: 'Auto-link test ticket',
      description: 'Resolving key-based requests.',
      priority: 'low',
    });

    expect(ticket.key).toBeDefined();

    // 1. Authorized request by a workspace member
    const response = await ownerApi.get(`/api/v1/tickets/key/${ticket.key}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: ticket.id,
      key: ticket.key,
      title: 'Auto-link test ticket',
    });

    // 2. Unauthorized request by a non-member
    const otherUserApi = await createAuthenticatedApi({
      name: 'Non Member',
      email: 'nonmember@example.com',
      role: 'developer',
      avatarUrl: 'https://example.com/nonmember.png',
    });
    const unauthorizedResponse = await otherUserApi.get(`/api/v1/tickets/key/${ticket.key}`);
    expect(unauthorizedResponse.status).toBe(403);



    // 5. Non-existent ticket key resolves to 404
    const notFoundResponse = await ownerApi.get('/api/v1/tickets/key/NONEXIST-999');
    expect(notFoundResponse.status).toBe(404);
  });

  it('handles comment editing and deletion via PATCH and DELETE', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Test Owner 2',
      email: 'test2@example.com',
      role: 'owner',
    });
    const { owner, project } = await seedWorkspaceFixture({
      owner: { id: ownerApi.user.id, name: ownerApi.user.name, email: ownerApi.user.email, role: 'owner', avatarUrl: ownerApi.user.avatar }
    });
    const ticket = await seedTicket(project.id, {
      id: 'ticket-1',
      title: 'Comment overhaul task',
      description: 'Testing comment updates and deletion',
      priority: 'low',
    });

    const createCommentResponse = await ownerApi.post(`/api/v1/tickets/${ticket.id}/comments`).send({
      userId: owner.id,
      body: 'Initial comment body',
    });
    expect(createCommentResponse.status).toBe(201);
    const commentId = createCommentResponse.body.id;

    // PATCH comment successfully
    const patchResponse = await ownerApi
      .patch(`/api/v1/tickets/${ticket.id}/comments/${commentId}`)
      .send({ body: 'Updated comment body' });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      id: commentId,
      body: 'Updated comment body',
    });

    // PATCH comment with empty body
    const patchEmptyResponse = await ownerApi
      .patch(`/api/v1/tickets/${ticket.id}/comments/${commentId}`)
      .send({ body: '' });
    expect(patchEmptyResponse.status).toBe(400);

    // PATCH comment for non-existent comment
    const patchNonExistentResponse = await ownerApi
      .patch(`/api/v1/tickets/${ticket.id}/comments/non-existent-comment`)
      .send({ body: 'Some body' });
    expect(patchNonExistentResponse.status).toBe(404);

    // DELETE comment successfully
    const deleteResponse = await ownerApi
      .delete(`/api/v1/tickets/${ticket.id}/comments/${commentId}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ success: true });

    // DELETE comment for non-existent comment
    const deleteNonExistentResponse = await ownerApi
      .delete(`/api/v1/tickets/${ticket.id}/comments/non-existent-comment`);
    expect(deleteNonExistentResponse.status).toBe(404);
  });
});