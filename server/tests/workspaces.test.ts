import { describe, expect, it } from 'vitest';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { projectMembers, projects, workspaceMembers } from '../src/db/schema.js';
import { getDefaultTeamId } from '../src/modules/workspaces/utils/default-team.js';

describe('workspaces routes', () => {
  it('creates, lists, and updates workspaces with settings and members', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Workspace Owner',
      email: 'workspace-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/workspace-owner.png',
    });
    const owner = ownerApi.user;

    const createResponse = await ownerApi
      .post('/api/v1/workspaces')
      .send({
        name: 'Gravity Core',
        description: 'The main Gravity workspace.',
        key: 'GRV',
        ownerId: owner.id,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.workspace).toMatchObject({
      name: 'Gravity Core',
      key: 'GRV',
      memberRole: 'owner',
      projectCount: 0,
      memberCount: 1,
    });

    const workspaceId = createResponse.body.workspace.id;
    const defaultProjectId = createResponse.body.workspace.defaultProjectId;
    expect(defaultProjectId).toBeNull();

    const teamsResponse = await ownerApi.get('/api/v1/teams').query({ workspaceId });
    expect(teamsResponse.status).toBe(200);
    expect(teamsResponse.body).toEqual([]);

    const listResponse = await ownerApi.get('/api/v1/workspaces').query({ userId: owner.id });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: workspaceId,
        name: 'Gravity Core',
        projectCount: 0,
        memberCount: 1,
      }),
    ]);

    const getResponse = await api().get(`/api/v1/workspaces/${workspaceId}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toMatchObject({
      id: workspaceId,
      name: 'Gravity Core',
      key: 'GRV',
    });

    const settingsResponse = await api().get(`/api/v1/workspaces/${workspaceId}/settings`);
    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.body).toMatchObject({
      workspaceId,
      joinMode: 'approval_required',
      hierarchyMode: 'flat',
      defaultProjectId: null,
    });

    const patchResponse = await ownerApi
      .patch(`/api/v1/workspaces/${workspaceId}/settings`)
      .send({
        hostUrl: 'http://gravity.test',
        joinMode: 'auto_join',
        hierarchyMode: 'teams',
        workspaceKey: 'WS-GRV-999999',
        defaultProjectId,
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      workspaceId,
      hostUrl: 'http://gravity.test',
      joinMode: 'auto_join',
      hierarchyMode: 'teams',
      workspaceKey: 'WS-GRV-999999',
      defaultProjectId,
    });

    const membersResponse = await ownerApi.get(`/api/v1/workspaces/${workspaceId}/members`);
    expect(membersResponse.status).toBe(200);
    expect(membersResponse.body).toEqual([
      expect.objectContaining({
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
      }),
    ]);
  });

  it('rejects mismatched actor identifiers when creating or listing workspaces', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Workspace Owner Authz',
      email: 'workspace-owner-authz@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/workspace-owner-authz.png',
    });
    const otherUserApi = await createAuthenticatedApi({
      name: 'Workspace Other User',
      email: 'workspace-other-user@example.com',
      role: 'member',
      avatarUrl: 'https://example.com/workspace-other-user.png',
    });
    const owner = ownerApi.user;
    const otherUser = otherUserApi.user;

    const createResponse = await ownerApi
      .post('/api/v1/workspaces')
      .send({
        name: 'Gravity Core Authz',
        description: 'The main Gravity workspace.',
        key: 'GRVAUTH',
        ownerId: otherUser.id,
      });

    expect(createResponse.status).toBe(403);
    expect(createResponse.body).toEqual({ error: 'Forbidden.' });

    const authorizedCreateResponse = await ownerApi
      .post('/api/v1/workspaces')
      .send({
        name: 'Gravity Core Authorized',
        description: 'The main Gravity workspace.',
        key: 'AUTHZFIX',
        ownerId: owner.id,
      });

    expect(authorizedCreateResponse.status).toBe(201);
    const workspaceId = authorizedCreateResponse.body.workspace.id;

    const listResponse = await ownerApi
      .get('/api/v1/workspaces')
      .query({ userId: otherUser.id });

    expect(listResponse.status).toBe(403);
    expect(listResponse.body).toEqual({ error: 'Forbidden.' });

    const authorizedListResponse = await ownerApi.get('/api/v1/workspaces');
    expect(authorizedListResponse.status).toBe(200);
    expect(authorizedListResponse.body).toEqual([
      expect.objectContaining({
        id: workspaceId,
        memberRole: 'owner',
      }),
    ]);
  });

  it('creates invites, join requests, approvals, and workspace connections', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace@example.com',
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

    const inviteResponse = await ownerApi
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .send({
        label: 'Team Invite',
      });

    expect(inviteResponse.status).toBe(201);
    expect(inviteResponse.body).toMatchObject({
      workspaceId: workspace.id,
      createdBy: owner.id,
      label: 'Team Invite',
    });

    const applicantApi = await createAuthenticatedApi({
      name: 'Join Requester',
      email: 'joiner@example.com',
      role: 'member',
      avatarUrl: 'https://example.com/joiner.png',
    });
    const applicant = applicantApi.user;

    const joinRequestResponse = await applicantApi
      .post(`/api/v1/workspaces/invites/${inviteResponse.body.code}/join-requests`)
      .send({ message: 'Requesting access to the workspace.' });

    expect(joinRequestResponse.status).toBe(201);
    expect(joinRequestResponse.body).toMatchObject({
      workspaceId: workspace.id,
      requestingUserId: applicant.id,
      status: 'pending',
    });

    const listInvitesResponse = await api().get(`/api/v1/workspaces/${workspace.id}/invites`);
    expect(listInvitesResponse.status).toBe(200);
    expect(listInvitesResponse.body).toEqual([
      expect.objectContaining({
        id: inviteResponse.body.id,
        code: inviteResponse.body.code,
        pendingJoinRequestCount: 1,
      }),
    ]);

    const listJoinRequestsResponse = await ownerApi.get(`/api/v1/workspaces/${workspace.id}/join-requests`);
    expect(listJoinRequestsResponse.status).toBe(200);
    expect(listJoinRequestsResponse.body).toEqual([
      expect.objectContaining({
        id: joinRequestResponse.body.id,
        requestingUserId: applicant.id,
        status: 'pending',
      }),
    ]);

    const approveResponse = await ownerApi
      .post(`/api/v1/workspaces/${workspace.id}/join-requests/${joinRequestResponse.body.id}/approve`)
      .send({});

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body).toMatchObject({
      id: joinRequestResponse.body.id,
      status: 'approved',
      reviewedBy: owner.id,
    });

  });

  it('exports all workspace tasks with metadata for owners only', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Audit Owner',
      email: 'audit-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/audit-owner.png',
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
      workspace: {
        id: 'workspace-export',
        key: 'AUD',
        name: 'Audit Workspace',
      },
      project: {
        id: 'project-export-1',
        key: 'AUD',
        name: 'Audit App',
        inviteCode: 'INV-AUD-0001ABCD',
      },
    });

    const memberApi = await createAuthenticatedApi({
      name: 'Audit Member',
      email: 'audit-member@example.com',
      role: 'member',
      avatarUrl: 'https://example.com/audit-member.png',
    });
    const member = memberApi.user;
    const secondProjectId = 'project-export-2';

    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: member.id,
      role: 'member',
      provisionedByValidationId: null,
      createdAt: new Date(),
    });

    await db.insert(projects).values({
      id: secondProjectId,
      workspaceId: workspace.id,
      teamId: getDefaultTeamId(workspace.id),
      name: 'Audit Ops',
      description: 'Operational audit tasks',
      key: 'OPS',
      status: 'active',
      inviteCode: 'INV-OPS-0001ABCD',
      createdBy: owner.id,
      githubRepoUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(projectMembers).values([
      {
        projectId: project.id,
        userId: member.id,
        role: 'developer',
        provisionedByValidationId: null,
        createdAt: new Date(),
      },
      {
        projectId: secondProjectId,
        userId: owner.id,
        role: 'owner',
        provisionedByValidationId: null,
        createdAt: new Date(),
      },
      {
        projectId: secondProjectId,
        userId: member.id,
        role: 'developer',
        provisionedByValidationId: null,
        createdAt: new Date(),
      },
    ]);

    const firstTicketResponse = await ownerApi
      .post('/api/v1/tickets')
      .set('x-project-id', project.id)
      .send({
        title: 'Review payment audit trail',
        description: 'Verify exported ticket fields.',
        status: 'in_progress',
        priority: 'high',
        assigneeId: member.id,
      });
    expect(firstTicketResponse.status).toBe(201);

    const secondTicketResponse = await ownerApi
      .post('/api/v1/tickets')
      .set('x-project-id', secondProjectId)
      .send({
        title: 'Archive workspace evidence',
        status: 'done',
        priority: 'medium',
      });
    expect(secondTicketResponse.status).toBe(201);

    const commentResponse = await ownerApi
      .post(`/api/v1/tickets/${firstTicketResponse.body.id}/comments`)
      .send({ body: 'Owner audit note.' });
    expect(commentResponse.status).toBe(201);

    const forbiddenResponse = await memberApi.get(`/api/v1/workspaces/${workspace.id}/export/tasks`);
    expect(forbiddenResponse.status).toBe(403);
    expect(forbiddenResponse.body).toEqual({ error: 'Only workspace owners can export tasks.' });

    const exportResponse = await ownerApi.get(`/api/v1/workspaces/${workspace.id}/export/tasks`);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers['content-disposition']).toContain('gravity-aud-tasks');
    expect(exportResponse.headers['cache-control']).toBe('no-store');

    expect(exportResponse.body.export).toMatchObject({
      type: 'workspace_tasks',
      version: 1,
      generatedBy: owner.id,
      taskCount: 2,
    });
    expect(exportResponse.body.workspace).toMatchObject({
      id: workspace.id,
      key: workspace.key,
    });

    const exportedTasks = exportResponse.body.tasks;
    expect(exportedTasks).toHaveLength(2);
    expect(exportedTasks.map((task: { key: string }) => task.key)).toEqual(
      expect.arrayContaining([firstTicketResponse.body.key, secondTicketResponse.body.key]),
    );

    const firstExportedTask = exportedTasks.find((task: { id: string }) => task.id === firstTicketResponse.body.id);
    expect(firstExportedTask).toMatchObject({
      title: 'Review payment audit trail',
      status: 'in_progress',
      priority: 'high',
      assignee: {
        id: member.id,
        name: member.name,
        email: member.email,
      },
      project: {
        id: project.id,
        name: project.name,
      },
    });
    expect(firstExportedTask.createdAt).toEqual(expect.any(String));
    expect(firstExportedTask.updatedAt).toEqual(expect.any(String));
    expect(firstExportedTask.comments).toEqual([
      expect.objectContaining({
        body: 'Owner audit note.',
        author: expect.objectContaining({
          id: owner.id,
          name: owner.name,
          email: owner.email,
        }),
      }),
    ]);

    const secondExportedTask = exportedTasks.find((task: { id: string }) => task.id === secondTicketResponse.body.id);
    expect(secondExportedTask.project).toMatchObject({
      id: secondProjectId,
      name: 'Audit Ops',
    });
  });
});
