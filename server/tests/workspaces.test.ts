import { describe, expect, it } from 'vitest';
import { api, seedUser, seedWorkspaceFixture } from './helpers/test-helpers.js';

describe('workspaces routes', () => {
  it('creates, lists, and updates workspaces with settings and members', async () => {
    const owner = await seedUser({
      id: 'workspace-owner',
      name: 'Workspace Owner',
      email: 'workspace-owner@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/workspace-owner.png',
    });

    const createResponse = await api()
      .post('/api/v1/workspaces')
      .set('x-user-id', owner.id)
      .send({
        name: 'Gravity Core',
        description: 'The main Gravity workspace.',
        key: 'GRV',
        ownerId: owner.id,
        defaultProjectName: 'Gravity App',
        defaultProjectKey: 'GRV',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.workspace).toMatchObject({
      name: 'Gravity Core',
      key: 'GRV',
      memberRole: 'owner',
      projectCount: 1,
      memberCount: 1,
    });

    const workspaceId = createResponse.body.workspace.id;
    const defaultProjectId = createResponse.body.workspace.defaultProjectId;

    const listResponse = await api().get('/api/v1/workspaces').set('x-user-id', owner.id).query({ userId: owner.id });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: workspaceId,
        name: 'Gravity Core',
        projectCount: 1,
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
      defaultProjectId,
    });

    const patchResponse = await api()
      .patch(`/api/v1/workspaces/${workspaceId}/settings`)
      .set('x-user-id', owner.id)
      .send({
        hostUrl: 'http://gravity.test',
        joinMode: 'auto_join',
        workspaceKey: 'WS-GRV-999999',
        defaultProjectId,
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      workspaceId,
      hostUrl: 'http://gravity.test',
      joinMode: 'auto_join',
      workspaceKey: 'WS-GRV-999999',
      defaultProjectId,
    });

    const membersResponse = await api()
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('x-user-id', owner.id);
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
    const owner = await seedUser({
      id: 'workspace-owner-authz',
      name: 'Workspace Owner Authz',
      email: 'workspace-owner-authz@example.com',
      role: 'owner',
      avatarUrl: 'https://example.com/workspace-owner-authz.png',
    });
    const otherUser = await seedUser({
      id: 'workspace-other-user',
      name: 'Workspace Other User',
      email: 'workspace-other-user@example.com',
      role: 'member',
      avatarUrl: 'https://example.com/workspace-other-user.png',
    });

    const createResponse = await api()
      .post('/api/v1/workspaces')
      .set('x-user-id', owner.id)
      .send({
        name: 'Gravity Core Authz',
        description: 'The main Gravity workspace.',
        key: 'GRVAUTH',
        ownerId: otherUser.id,
      });

    expect(createResponse.status).toBe(403);
    expect(createResponse.body).toEqual({ error: 'Forbidden.' });

    const authorizedCreateResponse = await api()
      .post('/api/v1/workspaces')
      .set('x-user-id', owner.id)
      .send({
        name: 'Gravity Core Authorized',
        description: 'The main Gravity workspace.',
        key: 'AUTHZFIX',
        ownerId: owner.id,
      });

    expect(authorizedCreateResponse.status).toBe(201);
    const workspaceId = authorizedCreateResponse.body.workspace.id;

    const listResponse = await api()
      .get('/api/v1/workspaces')
      .set('x-user-id', owner.id)
      .query({ userId: otherUser.id });

    expect(listResponse.status).toBe(403);
    expect(listResponse.body).toEqual({ error: 'Forbidden.' });

    const authorizedListResponse = await api().get('/api/v1/workspaces').set('x-user-id', owner.id);
    expect(authorizedListResponse.status).toBe(200);
    expect(authorizedListResponse.body).toEqual([
      expect.objectContaining({
        id: workspaceId,
        memberRole: 'owner',
      }),
    ]);
  });

  it('creates invites, join requests, approvals, and workspace connections', async () => {
    const { owner, workspace, project } = await seedWorkspaceFixture();

    const inviteResponse = await api().post(`/api/v1/workspaces/${workspace.id}/invites`).send({
      createdBy: owner.id,
      label: 'Team Invite',
    });

    expect(inviteResponse.status).toBe(201);
    expect(inviteResponse.body).toMatchObject({
      workspaceId: workspace.id,
      createdBy: owner.id,
      label: 'Team Invite',
    });

    const applicant = await seedUser({
      id: 'join-user',
      name: 'Join Requester',
      email: 'joiner@example.com',
      role: 'member',
      avatarUrl: 'https://example.com/joiner.png',
    });

    const joinRequestResponse = await api()
      .post(`/api/v1/workspaces/invites/${inviteResponse.body.code}/join-requests`)
      .send({ userId: applicant.id, message: 'Requesting access to the workspace.' });

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

    const listJoinRequestsResponse = await api().get(`/api/v1/workspaces/${workspace.id}/join-requests`);
    expect(listJoinRequestsResponse.status).toBe(200);
    expect(listJoinRequestsResponse.body).toEqual([
      expect.objectContaining({
        id: joinRequestResponse.body.id,
        requestingUserId: applicant.id,
        status: 'pending',
      }),
    ]);

    const approveResponse = await api()
      .post(`/api/v1/workspaces/${workspace.id}/join-requests/${joinRequestResponse.body.id}/approve`)
      .send({ reviewerUserId: owner.id });

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body).toMatchObject({
      id: joinRequestResponse.body.id,
      status: 'approved',
      reviewedBy: owner.id,
    });

  });
});