import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  api,
  createAuthenticatedApi,
  seedCycle,
  seedTicket,
  seedUser,
  seedWorkspaceFixture,
} from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { labels } from '../src/db/schema.js';
import { getDefaultTeamId } from '../src/modules/workspaces/utils/default-team.js';

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

    const listResponse = await ownerApi
      .get('/api/v1/projects')
      .query({ userId: owner.id, workspaceId: workspace.id });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: project.id,
        name: project.name,
        workspaceId: workspace.id,
      }),
    ]);

    const createResponse = await ownerApi.post('/api/v1/projects').send({
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

    const patchResponse = await ownerApi.patch(`/api/v1/projects/${createResponse.body.id}`).send({
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

    const addMemberResponse = await ownerApi.post(`/api/v1/projects/${createResponse.body.id}/members`).send({
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

  it('allows the same project key to be used in different workspaces', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Workspace Scoped Key Owner',
      email: 'scoped-key-owner@example.com',
      role: 'owner',
    });
    const owner = ownerApi.user;
    const { workspace: workspaceA } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
      project: {
        key: 'TEST',
      },
    });

    const createWorkspaceResponse = await ownerApi
      .post('/api/v1/workspaces')
      .send({
        name: 'Second Workspace',
        description: 'Second workspace for key-scoping checks',
        key: 'SBX',
        ownerId: owner.id,
      });

    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceBId = createWorkspaceResponse.body.workspace.id;

    const createProjectResponse = await ownerApi
      .post('/api/v1/projects')
      .send({
        workspaceId: workspaceBId,
        name: 'Second Workspace Project',
        key: 'TEST',
        description: 'Project key duplicate across workspaces',
      });

    expect(createProjectResponse.status).toBe(201);
    expect(createProjectResponse.body).toMatchObject({
      name: 'Second Workspace Project',
      key: 'TEST',
      workspaceId: workspaceBId,
      status: 'active',
    });

    expect(createProjectResponse.body.workspaceId).toBe(workspaceBId);
    expect(workspaceA.id).not.toEqual(workspaceBId);
  });

  it('requires authentication and workspace membership to create projects', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Project Owner',
      email: 'project-owner@example.com',
      role: 'owner',
    });
    const outsiderApi = await createAuthenticatedApi({
      name: 'Workspace Outsider',
      email: 'workspace-outsider@example.com',
      role: 'member',
    });

    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const unauthenticatedResponse = await api().post('/api/v1/projects').send({
      name: 'Unauthorized Project',
      key: 'UNAUTH',
      workspaceId: workspace.id,
    });
    expect(unauthenticatedResponse.status).toBe(401);
    expect(unauthenticatedResponse.body).toEqual({ error: 'Authentication required.' });

    const outsiderResponse = await outsiderApi.post('/api/v1/projects').send({
      name: 'Forbidden Project',
      key: 'FORBID',
      workspaceId: workspace.id,
    });
    expect(outsiderResponse.status).toBe(403);
    expect(outsiderResponse.body).toEqual({ error: 'Access denied: not a member of the workspace.' });

    const spoofedOwnerResponse = await ownerApi.post('/api/v1/projects').send({
      name: 'Spoofed Owner Project',
      key: 'SPOOF',
      workspaceId: workspace.id,
      ownerId: outsiderApi.user.id,
    });
    expect(spoofedOwnerResponse.status).toBe(403);
    expect(spoofedOwnerResponse.body).toEqual({ error: 'Forbidden.' });
  });

  it('keeps project-based labels scoped to their projects in the workspace sidebar', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Sidebar Label Owner',
      email: 'sidebar-label-owner@example.com',
      role: 'owner',
    });
    const { workspace, project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const secondProjectResponse = await ownerApi.post('/api/v1/projects').send({
      name: 'Gravity API',
      description: 'API project',
      key: 'API',
      ownerId: ownerApi.user.id,
      workspaceId: workspace.id,
    });
    expect(secondProjectResponse.status).toBe(201);
    const secondProjectId = secondProjectResponse.body.id;

    const firstLabelResponse = await ownerApi.post('/api/v1/labels').send({
      projectId: project.id,
      name: 'Frontend',
      color: '#2563eb',
    });
    const secondLabelResponse = await ownerApi.post('/api/v1/labels').send({
      projectId: secondProjectId,
      name: 'Payments',
      color: '#10b981',
    });
    expect(firstLabelResponse.status).toBe(201);
    expect(secondLabelResponse.status).toBe(201);

    const firstProjectLabels = await ownerApi.get('/api/v1/labels').query({ projectId: project.id });
    expect(firstProjectLabels.status).toBe(200);
    expect(firstProjectLabels.body).toEqual([
      expect.objectContaining({
        id: firstLabelResponse.body.id,
        projectId: project.id,
        name: 'Frontend',
      }),
    ]);

    const secondProjectLabels = await ownerApi.get('/api/v1/labels').query({ projectId: secondProjectId });
    expect(secondProjectLabels.status).toBe(200);
    expect(secondProjectLabels.body).toEqual([
      expect.objectContaining({
        id: secondLabelResponse.body.id,
        projectId: secondProjectId,
        name: 'Payments',
      }),
    ]);

    const sidebarResponse = await ownerApi.get(`/api/v1/workspaces/${workspace.id}/sidebar`);
    expect(sidebarResponse.status).toBe(200);
    expect(sidebarResponse.body.hierarchyMode).toBe('flat');

    const sidebarLabels = sidebarResponse.body.teams.flatMap((team: { labels?: Array<{ id: string; projectId?: string; name: string }> }) => team.labels ?? []);
    expect(sidebarLabels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: firstLabelResponse.body.id,
        projectId: project.id,
        name: 'Frontend',
      }),
      expect.objectContaining({
        id: secondLabelResponse.body.id,
        projectId: secondProjectId,
        name: 'Payments',
      }),
    ]));
    expect(sidebarLabels.filter((label: { name: string }) => label.name === 'Frontend')).toHaveLength(1);
    expect(sidebarLabels.filter((label: { name: string }) => label.name === 'Payments')).toHaveLength(1);
  });

  it('uses the project scope when project-based label creation also sends a team id', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Mixed Scope Label Owner',
      email: 'mixed-scope-label-owner@example.com',
      role: 'owner',
    });
    const { workspace, project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });
    const teamId = getDefaultTeamId(workspace.id);

    const createLabelResponse = await ownerApi.post('/api/v1/labels').send({
      projectId: project.id,
      teamId,
      name: 'Mixed Scope',
      color: '#7c3aed',
    });
    expect(createLabelResponse.status).toBe(201);
    expect(createLabelResponse.body).toEqual(expect.objectContaining({
      teamId,
      projectId: project.id,
      name: 'Mixed Scope',
    }));

    const projectLabelsResponse = await ownerApi.get('/api/v1/labels').query({ projectId: project.id });
    expect(projectLabelsResponse.status).toBe(200);
    expect(projectLabelsResponse.body).toEqual([
      expect.objectContaining({
        id: createLabelResponse.body.id,
        projectId: project.id,
        name: 'Mixed Scope',
      }),
    ]);

    const teamLabelsResponse = await ownerApi.get('/api/v1/labels').query({ teamId });
    expect(teamLabelsResponse.status).toBe(200);
    expect(teamLabelsResponse.body).toHaveLength(0);

    const teamOnlyResponse = await ownerApi.post('/api/v1/labels').send({
      teamId,
      name: 'Invalid Team Scope',
    });
    expect(teamOnlyResponse.status).toBe(400);
    expect(teamOnlyResponse.body).toEqual({
      error: 'Project ID is required to create labels in project-based workspaces.',
    });
  });

  it('stores labels created from project request scope with a project id in project-based workspaces', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Header Scope Label Owner',
      email: 'header-scope-label-owner@example.com',
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

    const createLabelResponse = await ownerApi
      .post('/api/v1/labels')
      .set('X-Project-Id', project.id)
      .send({
        name: 'Header Scoped',
        color: '#0ea5e9',
      });

    expect(createLabelResponse.status).toBe(201);
    expect(createLabelResponse.body).toEqual(expect.objectContaining({
      projectId: project.id,
      name: 'Header Scoped',
    }));

    const storedLabels = await db
      .select({ projectId: labels.projectId })
      .from(labels)
      .where(eq(labels.id, createLabelResponse.body.id))
      .limit(1);

    expect(storedLabels).toEqual([{ projectId: project.id }]);
  });

  it('manages tickets, comments, labels, and cycles', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Test Owner',
      email: 'test@example.com',
      role: 'owner',
    });
    const { owner, project } = await seedWorkspaceFixture({
      owner: { id: ownerApi.user.id, name: ownerApi.user.name, email: ownerApi.user.email, role: 'owner', avatarUrl: ownerApi.user.avatar }
    });

    const createLabelResponse = await ownerApi.post('/api/v1/labels').send({
      projectId: project.id,
      name: 'Platform',
      color: '#0F766E',
    });

    expect(createLabelResponse.status).toBe(201);

    const listLabelsResponse = await ownerApi.get('/api/v1/labels').query({ projectId: project.id });
    expect(listLabelsResponse.status).toBe(200);
    expect(listLabelsResponse.body).toEqual([
      expect.objectContaining({
        id: createLabelResponse.body.id,
        name: 'Platform',
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
      labelIds: [createLabelResponse.body.id],
      cycleId: createCycleResponse.body.id,
      assigneeId: owner.id,
      priority: 'high',
    });

    expect(createTicketResponse.status).toBe(201);
    expect(createTicketResponse.body).toMatchObject({
      title: 'Ship server endpoint coverage',
      projectId: project.id,
      labelIds: [createLabelResponse.body.id],
      labels: [
        expect.objectContaining({
          id: createLabelResponse.body.id,
          name: 'Platform',
          color: '#0F766E',
        }),
      ],
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
    expect(unauthorizedResponse.body).toEqual({ error: 'Access denied: not a member of the workspace.' });
    expect(unauthorizedResponse.body).not.toHaveProperty('id');
    expect(unauthorizedResponse.body).not.toHaveProperty('key');
    expect(unauthorizedResponse.body).not.toHaveProperty('title');

    const unauthorizedRelationsResponse = await otherUserApi
      .get(`/api/v1/tickets/key/${ticket.key}`)
      .query({ include: 'relations' });
    expect(unauthorizedRelationsResponse.status).toBe(403);
    expect(unauthorizedRelationsResponse.body).toEqual({ error: 'Access denied: not a member of the workspace.' });

    // 3. Non-existent ticket key resolves to 404
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
