import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedUser } from '../tests/helpers/test-helpers.js';

const app = createApp();

describe('Server Workspaces Flow E2E', () => {
  it('should successfully execute the complete workspace, invites, approvals, and peer validation lifecycle', async () => {
    // 1. Seed two active users using the test helper
    const owner = await seedUser({
      id: 'owner-1',
      name: 'Owner User',
      email: 'owner@gravity.dev',
      role: 'owner',
    });

    const collaborator = await seedUser({
      id: 'collab-1',
      name: 'Collaborator User',
      email: 'collab@gravity.dev',
      role: 'guest_contributor',
    });

    const ownerId = owner.id;
    const collaboratorId = collaborator.id;

    // 2. POST /api/v1/workspaces to create a workspace on behalf of the owner
    const resCreateWorkspace = await request(app)
      .post('/api/v1/workspaces')
      .set('x-user-id', ownerId)
      .send({
        name: 'Remote Ops',
        description: 'Workspace test harness',
        key: 'ROPS',
        workspaceKey: 'ROPS-SECRET',
        ownerId,
        defaultProjectName: 'Remote Ops',
        defaultProjectKey: 'ROPS',
      });

    expect(resCreateWorkspace.status).toBe(201);
    expect(resCreateWorkspace.body.workspace).toBeDefined();
    
    const workspaceId = resCreateWorkspace.body.workspace.id;
    expect(workspaceId).toBeDefined();

    // 2b. POST /api/v1/projects to create a project manually
    const resCreateProject = await request(app)
      .post('/api/v1/projects')
      .set('x-user-id', ownerId)
      .send({
        name: 'Remote Ops Extra',
        key: 'ROPS2',
        ownerId,
        workspaceId,
      });

    expect(resCreateProject.status).toBe(201);
    const extraProjectId = resCreateProject.body.id;
    expect(extraProjectId).toBeDefined();

    // 3. GET /api/v1/workspaces to verify owner workspace listing
    const resOwnerWorkspaces = await request(app)
      .get(`/api/v1/workspaces?userId=${encodeURIComponent(ownerId)}`)
      .set('x-user-id', ownerId);

    expect(resOwnerWorkspaces.status).toBe(200);
    expect(Array.isArray(resOwnerWorkspaces.body)).toBe(true);
    expect(resOwnerWorkspaces.body.some((ws: any) => ws.id === workspaceId)).toBe(true);

    // 4. GET /api/v1/workspaces/:id/settings to load workspace settings
    const resWorkspaceSettings = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/settings`)
      .set('x-user-id', ownerId);

    expect(resWorkspaceSettings.status).toBe(200);
    expect(resWorkspaceSettings.body.workspaceKey).toBe('ROPS-SECRET');

    // 5. POST /api/v1/workspaces/:id/invites to create an invitation
    // Security check: Unauthenticated should fail
    const resCreateInviteUnauth = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/invites`)
      .send({ label: 'Unauthorized invite' });
    expect(resCreateInviteUnauth.status).toBe(401);

    // Security check: Non-owner/non-member collaborator should fail
    const resCreateInviteCollab = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/invites`)
      .set('x-user-id', collaboratorId)
      .send({ label: 'Forbidden invite' });
    expect(resCreateInviteCollab.status).toBe(403);

    const resCreateInvite = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/invites`)
      .set('x-user-id', ownerId)
      .send({
        createdBy: ownerId,
        label: 'Initial collaborator invite',
      });

    expect(resCreateInvite.status).toBe(201);
    expect(resCreateInvite.body.code).toBeDefined();
    const inviteCode = resCreateInvite.body.code;

    // 5b. GET /api/v1/workspaces/:id/invites to list the workspace invitations
    const resListInvites = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/invites`)
      .set('x-user-id', ownerId);

    expect(resListInvites.status).toBe(200);
    expect(Array.isArray(resListInvites.body)).toBe(true);
    expect(resListInvites.body.some((inv: any) => inv.code === inviteCode)).toBe(true);

    // 6. POST /api/v1/workspaces/invites/:code/join-requests to request to join
    const resJoinRequest = await request(app)
      .post(`/api/v1/workspaces/invites/${encodeURIComponent(inviteCode)}/join-requests`)
      .set('x-user-id', collaboratorId)
      .send({
        userId: collaboratorId,
        message: 'Requesting access for integration test.',
      });

    expect(resJoinRequest.status).toBe(201);
    expect(resJoinRequest.body.status).toBe('pending');
    const joinRequestId = resJoinRequest.body.id;
    expect(joinRequestId).toBeDefined();

    // 7. GET /api/v1/workspaces/:id/join-requests to list pending requests
    // Security check: Unauthenticated should fail
    const resPendingRequestsUnauth = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/join-requests`);
    expect(resPendingRequestsUnauth.status).toBe(401);

    // Security check: Collaborator (not approved owner/admin yet) should fail
    const resPendingRequestsCollab = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/join-requests`)
      .set('x-user-id', collaboratorId);
    expect(resPendingRequestsCollab.status).toBe(403);

    const resPendingRequests = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/join-requests`)
      .set('x-user-id', ownerId);

    expect(resPendingRequests.status).toBe(200);
    expect(Array.isArray(resPendingRequests.body)).toBe(true);
    expect(resPendingRequests.body.some((req: any) => req.id === joinRequestId)).toBe(true);

    // 8. POST /api/v1/workspaces/:id/join-requests/:id/approve to approve the request
    // Security check: Unauthenticated should fail
    const resApproveRequestUnauth = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/join-requests/${joinRequestId}/approve`)
      .send({ reviewerUserId: ownerId });
    expect(resApproveRequestUnauth.status).toBe(401);

    // Security check: Collaborator (not owner/admin) should fail
    const resApproveRequestCollab = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/join-requests/${joinRequestId}/approve`)
      .set('x-user-id', collaboratorId)
      .send({ reviewerUserId: collaboratorId });
    expect(resApproveRequestCollab.status).toBe(403);

    const resApproveRequest = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/join-requests/${joinRequestId}/approve`)
      .set('x-user-id', ownerId)
      .send({
        reviewerUserId: ownerId,
      });

    expect(resApproveRequest.status).toBe(200);
    expect(resApproveRequest.body.status).toBe('approved');

    // 9. GET /api/v1/workspaces/:id/members to check workspace members
    const resWorkspaceMembers = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('x-user-id', ownerId);

    expect(resWorkspaceMembers.status).toBe(200);
    expect(Array.isArray(resWorkspaceMembers.body)).toBe(true);
    expect(resWorkspaceMembers.body.some((m: any) => m.id === collaboratorId)).toBe(true);

    // 11. GET /api/v1/projects to see collaborator projects listing
    const resCollaboratorProjects = await request(app)
      .get(`/api/v1/projects?userId=${encodeURIComponent(collaboratorId)}&workspaceId=${encodeURIComponent(workspaceId)}`)
      .set('x-user-id', collaboratorId);

    expect(resCollaboratorProjects.status).toBe(200);
    expect(resCollaboratorProjects.body.length).toBe(2);

    // 12. PATCH /api/v1/workspaces/:id/settings to rotate workspace settings/key
    const resUpdateSettings = await request(app)
      .patch(`/api/v1/workspaces/${workspaceId}/settings`)
      .set('x-user-id', ownerId)
      .send({
        hostUrl: 'http://localhost:5002',
        joinMode: 'approval_required',
        workspaceKey: 'ROPS-SECRET-2',
      });

    expect(resUpdateSettings.status).toBe(200);
    expect(resUpdateSettings.body.workspaceKey).toBe('ROPS-SECRET-2');



    // 33. DELETE /api/v1/workspaces/:workspaceId to delete the workspace
    const resDeleteWorkspace = await request(app)
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('x-user-id', ownerId);

    expect(resDeleteWorkspace.status).toBe(200);
    expect(resDeleteWorkspace.body.success).toBe(true);

    // 34. GET /api/v1/workspaces?userId=:ownerId to verify workspace is gone
    const resFinalWorkspaces = await request(app)
      .get(`/api/v1/workspaces?userId=${encodeURIComponent(ownerId)}`)
      .set('x-user-id', ownerId);

    expect(resFinalWorkspaces.status).toBe(200);
    expect(resFinalWorkspaces.body.some((ws: any) => ws.id === workspaceId)).toBe(false);
  });
});
