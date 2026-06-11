import { describe, expect, it } from 'vitest';
import { api, createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';

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
});
