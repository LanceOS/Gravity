import { describe, expect, it } from 'vitest';
import {
  api,
  seedCycle,
  seedDomain,
  seedTicket,
  seedUser,
  seedValidationAccess,
  seedWorkspaceFixture,
} from './helpers/test-helpers.js';

describe('projects and tickets routes', () => {
  it('rejects invalid workspace access keys when listing projects', async () => {
    const response = await api().get('/api/v1/projects').set('x-workspace-key', 'invalid-key');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid workspace access key.' });
  });

  it('lists, creates, updates, and shares projects', async () => {
    const { owner, workspace, project } = await seedWorkspaceFixture();
    const domain = await seedDomain(project.id, { id: 'domain-1', name: 'Frontend', color: '#2563EB' });
    const cycle = await seedCycle(project.id, {
      id: 'cycle-1',
      name: 'Sprint 7',
      startDate: new Date('2025-01-03T00:00:00.000Z'),
      endDate: new Date('2025-01-10T00:00:00.000Z'),
    });

    const listResponse = await api().get('/api/v1/projects').query({ userId: owner.id, workspaceId: workspace.id });
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
    const { owner, workspace, project } = await seedWorkspaceFixture();

    const createDomainResponse = await api().post('/api/v1/domains').send({
      projectId: project.id,
      name: 'Platform',
      color: '#0F766E',
    });

    expect(createDomainResponse.status).toBe(201);

    const listDomainsResponse = await api().get('/api/v1/domains').query({ projectId: project.id });
    expect(listDomainsResponse.status).toBe(200);
    expect(listDomainsResponse.body).toEqual([
      {
        id: createDomainResponse.body.id,
        name: 'Platform',
        color: '#0F766E',
      },
    ]);

    const createCycleResponse = await api().post('/api/v1/cycles').send({
      projectId: project.id,
      name: 'Sprint Alpha',
      startDate: '2025-01-15T00:00:00.000Z',
      endDate: '2025-01-22T00:00:00.000Z',
    });

    expect(createCycleResponse.status).toBe(201);

    const listCyclesResponse = await api().get('/api/v1/cycles').query({ projectId: project.id });
    expect(listCyclesResponse.status).toBe(200);
    expect(listCyclesResponse.body).toEqual([
      expect.objectContaining({
        id: createCycleResponse.body.id,
        name: 'Sprint Alpha',
      }),
    ]);

    const createTicketResponse = await api().post('/api/v1/tickets').send({
      projectId: project.id,
      title: 'Ship server endpoint coverage',
      description: 'Cover every route with pg-mem-backed tests.',
      domainId: createDomainResponse.body.id,
      cycleId: createCycleResponse.body.id,
      assigneeId: owner.id,
      priority: 'high',
    });

    expect(createTicketResponse.status).toBe(201);
    expect(createTicketResponse.body).toMatchObject({
      title: 'Ship server endpoint coverage',
      projectId: project.id,
      domainId: createDomainResponse.body.id,
      cycleId: createCycleResponse.body.id,
      assigneeId: owner.id,
    });

    const listTicketsResponse = await api().get('/api/v1/tickets').query({ projectId: project.id });
    expect(listTicketsResponse.status).toBe(200);
    expect(listTicketsResponse.body).toEqual([
      expect.objectContaining({
        id: createTicketResponse.body.id,
        title: 'Ship server endpoint coverage',
      }),
    ]);

    const detailResponse = await api()
      .get(`/api/v1/tickets/${createTicketResponse.body.id}`)
      .query({ projectId: project.id });
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toMatchObject({
      id: createTicketResponse.body.id,
      title: 'Ship server endpoint coverage',
    });

    const patchResponse = await api()
      .patch(`/api/v1/tickets/${createTicketResponse.body.id}`)
      .set('x-project-id', project.id)
      .send({ status: 'in_review', prStatus: 'open' });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      id: createTicketResponse.body.id,
      status: 'in_review',
      prStatus: 'open',
    });

    const ownerCommentResponse = await api().post(`/api/v1/tickets/${createTicketResponse.body.id}/comments`).send({
      userId: owner.id,
      body: 'First pass ready.',
    });

    expect(ownerCommentResponse.status).toBe(201);
    expect(ownerCommentResponse.body).toMatchObject({
      ticketId: createTicketResponse.body.id,
      userId: owner.id,
      body: 'First pass ready.',
    });

    const guest = await seedUser({
      id: 'guest-1',
      name: 'Guest Reviewer',
      email: 'guest@example.com',
      role: 'guest_contributor',
      avatarUrl: 'https://example.com/guest.png',
    });

    const validation = await seedValidationAccess({
      workspaceId: workspace.id,
      guestUserId: guest.id,
      email: guest.email,
      workspacePrivateKey: 'sec_wsp_ticket_access',
    });

    const guestCommentResponse = await api()
      .post(`/api/v1/tickets/${createTicketResponse.body.id}/comments`)
      .set('x-workspace-key', validation.workspacePrivateKey)
      .send({ body: 'Reviewed through peer access.' });

    expect(guestCommentResponse.status).toBe(201);
    expect(guestCommentResponse.body).toMatchObject({
      ticketId: createTicketResponse.body.id,
      userId: guest.id,
      body: 'Reviewed through peer access.',
    });

    const listCommentsResponse = await api()
      .get(`/api/v1/tickets/${createTicketResponse.body.id}/comments`)
      .set('x-workspace-key', validation.workspacePrivateKey);

    expect(listCommentsResponse.status).toBe(200);
    expect(listCommentsResponse.body).toHaveLength(2);

    const deleteResponse = await api()
      .delete(`/api/v1/tickets/${createTicketResponse.body.id}`)
      .query({ projectId: project.id });

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ success: true });
  });
});