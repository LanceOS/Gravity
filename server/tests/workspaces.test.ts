import { describe, expect, it, vi } from 'vitest';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { projectMembers, projects, tickets, workspaceInvites, workspaceMembers } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
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
      .post('/api/v1/workspaces/invites/join-requests')
      .send({ inviteCode: inviteResponse.body.code, message: 'Requesting access to the workspace.' });

    expect(joinRequestResponse.status).toBe(201);
    expect(joinRequestResponse.body).toMatchObject({
      workspaceId: workspace.id,
      requestingUserId: applicant.id,
      status: 'pending',
    });

    const listInvitesResponse = await ownerApi.get(`/api/v1/workspaces/${workspace.id}/invites`);
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

  it('keeps invite codes out of API paths and permits one atomic redemption', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'invite-owner@example.com', role: 'owner' });
    const firstApi = await createAuthenticatedApi({ email: 'invite-first@example.com' });
    const secondApi = await createAuthenticatedApi({ email: 'invite-second@example.com' });
    const { workspace } = await seedWorkspaceFixture({ owner: ownerApi.user });
    const url = `/api/v1/workspaces/${workspace.id}/invites`;

    const created = await ownerApi.post(url).send({ label: 'One person' });
    expect(created.status).toBe(201);
    expect(created.headers['referrer-policy']).toBe('no-referrer');
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body.code).toMatch(/^WSP-[A-F0-9]{48}$/);
    expect(new Date(created.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(new Date(created.body.expiresAt).getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);

    const unauthenticatedList = await api().get(url);
    expect(unauthenticatedList.status).toBe(401);
    expect(unauthenticatedList.text).not.toContain(created.body.code);
    const outsiderList = await firstApi.get(url);
    expect(outsiderList.status).toBe(403);
    const adminApi = await createAuthenticatedApi({ email: 'invite-admin@example.com' });
    const memberApi = await createAuthenticatedApi({ email: 'invite-member@example.com' });
    await db.insert(workspaceMembers).values([
      { workspaceId: workspace.id, userId: adminApi.user.id, role: 'admin' },
      { workspaceId: workspace.id, userId: memberApi.user.id, role: 'member' },
    ]);
    const adminList = await adminApi.get(url);
    expect(adminList.status).toBe(200);
    expect(adminList.body[0].code).toBe(created.body.code);
    expect((await memberApi.get(url)).status).toBe(403);

    const joinUrl = '/api/v1/workspaces/invites/join-requests';
    const [first, second] = await Promise.all([
      firstApi.post(joinUrl).send({ inviteCode: created.body.code }),
      secondApi.post(joinUrl).send({ inviteCode: created.body.code }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 400]);
    expect(first.headers['referrer-policy']).toBe('no-referrer');
    expect(second.headers['referrer-policy']).toBe('no-referrer');
    const [stored] = await db.select().from(workspaceInvites).where(eq(workspaceInvites.id, created.body.id));
    expect(stored.useCount).toBe(1);
    expect(stored.revokedAt).not.toBeNull();
  });

  it('allows only one concurrent auto-join and commits its membership with redemption', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'auto-owner@example.com', role: 'owner' });
    const firstApi = await createAuthenticatedApi({ email: 'auto-first@example.com' });
    const secondApi = await createAuthenticatedApi({ email: 'auto-second@example.com' });
    const { workspace, project } = await seedWorkspaceFixture({ owner: ownerApi.user, workspace: { joinMode: 'auto_join' } });
    const created = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/invites`).send({ label: 'Auto join' });
    const joinUrl = '/api/v1/workspaces/invites/join-requests';
    const [first, second] = await Promise.all([
      firstApi.post(joinUrl).send({ inviteCode: created.body.code }),
      secondApi.post(joinUrl).send({ inviteCode: created.body.code }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 400]);
    const winner = first.status === 201 ? firstApi.user.id : secondApi.user.id;
    const loser = first.status === 400 ? firstApi.user.id : secondApi.user.id;
    const members = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspace.id));
    const projectRows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, project.id));
    expect(members.filter((row) => row.userId === winner)).toHaveLength(1);
    expect(members.filter((row) => row.userId === loser)).toHaveLength(0);
    expect(projectRows.filter((row) => row.userId === winner)).toHaveLength(1);
    expect(projectRows.filter((row) => row.userId === loser)).toHaveLength(0);
  });

  it('reports expiry if a token expires after lookup but before the conditional update', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'race-expiry-owner@example.com', role: 'owner' });
    const applicantApi = await createAuthenticatedApi({ email: 'race-expiry-applicant@example.com' });
    const { workspace } = await seedWorkspaceFixture({ owner: ownerApi.user });
    const created = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/invites`).send({ label: 'Boundary' });
    const originalTransaction = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementationOnce(async (callback) => {
      await db.update(workspaceInvites).set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(workspaceInvites.id, created.body.id));
      return originalTransaction(callback);
    });
    const response = await applicantApi.post('/api/v1/workspaces/invites/join-requests')
      .send({ inviteCode: created.body.code });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'This invite has expired.' });
    const [stored] = await db.select().from(workspaceInvites).where(eq(workspaceInvites.id, created.body.id));
    expect(stored.useCount).toBe(0);
  });

  it('rejects expired, legacy, and missing-expiration invites', async () => {
    const ownerApi = await createAuthenticatedApi({ email: 'invite-expiry-owner@example.com', role: 'owner' });
    const applicantApi = await createAuthenticatedApi({ email: 'invite-expiry-applicant@example.com' });
    const { workspace } = await seedWorkspaceFixture({ owner: ownerApi.user });
    const created = await ownerApi.post(`/api/v1/workspaces/${workspace.id}/invites`).send({ label: 'Soon expired' });
    const join = () => applicantApi.post('/api/v1/workspaces/invites/join-requests').send({ inviteCode: created.body.code });
    await db.update(workspaceInvites).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(workspaceInvites.id, created.body.id));
    expect((await join()).status).toBe(400);
    await db.update(workspaceInvites).set({ expiresAt: null }).where(eq(workspaceInvites.id, created.body.id));
    expect((await join()).status).toBe(400);
    await db.update(workspaceInvites).set({
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(Date.now() - 16 * 60_000),
    }).where(eq(workspaceInvites.id, created.body.id));
    expect((await join()).status).toBe(400);
    await db.update(workspaceInvites).set({
      code: 'WSP-GRV-1234',
      createdAt: new Date(),
    }).where(eq(workspaceInvites.id, created.body.id));
    expect((await applicantApi.post('/api/v1/workspaces/invites/join-requests').send({ inviteCode: 'WSP-GRV-1234' })).status).toBe(400);
    const [stored] = await db.select().from(workspaceInvites).where(eq(workspaceInvites.id, created.body.id));
    expect(stored.useCount).toBe(0);
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
      taskCountExact: '2',
    });
    expect(exportResponse.body.workspace).toMatchObject({
      id: workspace.id,
      key: workspace.key,
    });
    expect(exportResponse.body.taskExport).toEqual({
      taskCount: '2',
      expectedTaskCount: '2',
      complete: true,
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

  it('streams complete workspace task export for large workspaces', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Bulk Export Owner',
      email: 'bulk-export-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/bulk-export-owner.png',
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
        id: 'workspace-export-large',
        key: 'BULK',
        name: 'Bulk Audit Workspace',
      },
      project: {
        id: 'project-export-large-1',
        key: 'LAA',
        name: 'Audit App',
        inviteCode: 'INV-LAA-0001ABCD',
      },
    });

    const secondProjectId = 'project-export-large-2';
    await db.insert(projects).values({
      id: secondProjectId,
      workspaceId: workspace.id,
      teamId: getDefaultTeamId(workspace.id),
      name: 'Audit Operations',
      description: 'Operational audit tasks',
      key: 'OPS',
      status: 'active',
      inviteCode: 'INV-OPS-0002ABCD',
      createdBy: owner.id,
      githubRepoUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(projectMembers).values([
      {
        projectId: secondProjectId,
        userId: owner.id,
        role: 'owner',
        provisionedByValidationId: null,
        createdAt: new Date(),
      },
    ]);

    const baseCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    const tasksPerProject = 260;
    const bulkTasks = [];

    for (let i = 0; i < tasksPerProject; i += 1) {
      bulkTasks.push({
        id: `bulk-export-task-a-${String(i).padStart(3, '0')}`,
        key: `LAA-${String(i).padStart(4, '0')}`,
        title: `Audit App Task ${i + 1}`,
        description: 'Large export stress coverage.',
        status: i % 3 === 0 ? 'in_progress' : i % 3 === 1 ? 'todo' : 'done',
        priority: i % 2 === 0 ? 'high' : 'medium',
        assigneeId: i === 0 ? owner.id : null,
        projectId: project.id,
        cycleId: null,
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: new Date(baseCreatedAt.getTime() + i * 60000),
        updatedAt: new Date(baseCreatedAt.getTime() + i * 60000),
      });
    }

    for (let i = 0; i < tasksPerProject; i += 1) {
      bulkTasks.push({
        id: `bulk-export-task-b-${String(i).padStart(3, '0')}`,
        key: `OPS-${String(i).padStart(4, '0')}`,
        title: `Audit Ops Task ${i + 1}`,
        description: 'Large export stress coverage.',
        status: i % 3 === 0 ? 'done' : i % 3 === 1 ? 'in_progress' : 'todo',
        priority: i % 2 === 0 ? 'low' : 'medium',
        assigneeId: i === 0 ? owner.id : null,
        projectId: secondProjectId,
        cycleId: null,
        parentId: null,
        prStatus: 'none',
        prUrl: null,
        createdAt: new Date(baseCreatedAt.getTime() + 10 * 60000 + i * 60000),
        updatedAt: new Date(baseCreatedAt.getTime() + 10 * 60000 + i * 60000),
      });
    }

    await db.insert(tickets).values(bulkTasks);

    const commentResponse = await ownerApi.post(`/api/v1/tickets/${bulkTasks[0].id}/comments`).send({
      body: 'Owner bulk export note.',
    });
    expect(commentResponse.status).toBe(201);

    const exportResponse = await ownerApi.get(`/api/v1/workspaces/${workspace.id}/export/tasks`);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers['content-disposition']).toContain('gravity-bulk-tasks');
    expect(exportResponse.headers['cache-control']).toBe('no-store');

    const expectedTaskCount = bulkTasks.length;
    expect(exportResponse.body.export).toMatchObject({
      type: 'workspace_tasks',
      version: 1,
      generatedBy: owner.id,
      taskCount: expectedTaskCount,
      taskCountExact: String(expectedTaskCount),
    });
    expect(exportResponse.body.workspace).toMatchObject({
      id: workspace.id,
      key: workspace.key,
    });
    expect(exportResponse.body.taskExport).toMatchObject({
      taskCount: String(expectedTaskCount),
      expectedTaskCount: String(expectedTaskCount),
      complete: true,
    });

    const exportedTasks = exportResponse.body.tasks;
    expect(exportedTasks).toHaveLength(expectedTaskCount);

    const expectedOrder = [...bulkTasks]
      .map((task) => ({
        id: task.id,
        projectName: task.projectId === project.id ? 'Audit App' : 'Audit Operations',
        createdAt: task.createdAt,
        key: task.key,
      }))
      .sort((left, right) => {
        const projectComparison = left.projectName.localeCompare(right.projectName);
        if (projectComparison !== 0) {
          return projectComparison;
        }
        const createdAtComparison = left.createdAt.getTime() - right.createdAt.getTime();
        if (createdAtComparison !== 0) {
          return createdAtComparison;
        }
        return left.key.localeCompare(right.key);
      })
      .map((row) => row.id);

    expect(exportedTasks.map((task: { id: string }) => task.id)).toEqual(expectedOrder);

    const firstExportedTask = exportedTasks.find((task: { id: string }) => task.id === bulkTasks[0].id);
    expect(firstExportedTask).toMatchObject({
      id: bulkTasks[0].id,
      status: bulkTasks[0].status,
      priority: bulkTasks[0].priority,
      assignee: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
      },
      project: {
        name: 'Audit App',
        key: 'LAA',
      },
      comments: [
        expect.objectContaining({
          body: 'Owner bulk export note.',
          author: expect.objectContaining({
            id: owner.id,
            name: owner.name,
            email: owner.email,
          }),
        }),
      ],
    });
    expect(firstExportedTask.createdAt).toEqual(expect.any(String));
    expect(firstExportedTask.updatedAt).toEqual(expect.any(String));
  });
});
