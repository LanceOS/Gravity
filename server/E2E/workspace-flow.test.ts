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
        defaultProjectName: 'Remote Ops Core',
        defaultProjectKey: 'ROPS',
      });

    expect(resCreateWorkspace.status).toBe(201);
    expect(resCreateWorkspace.body.workspace).toBeDefined();
    
    const workspaceId = resCreateWorkspace.body.workspace.id;
    const defaultProjectId = resCreateWorkspace.body.workspace.defaultProjectId;
    expect(workspaceId).toBeDefined();
    expect(defaultProjectId).toBeDefined();

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
    const resPendingRequests = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/join-requests`)
      .set('x-user-id', ownerId);

    expect(resPendingRequests.status).toBe(200);
    expect(Array.isArray(resPendingRequests.body)).toBe(true);
    expect(resPendingRequests.body.some((req: any) => req.id === joinRequestId)).toBe(true);

    // 8. POST /api/v1/workspaces/:id/join-requests/:id/approve to approve the request
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

    // 10. POST /api/v1/workspaces/connect to connect with the workspace key
    const resConnectWorkspace = await request(app)
      .post('/api/v1/workspaces/connect')
      .set('x-user-id', collaboratorId)
      .send({
        userId: collaboratorId,
        workspaceId,
        workspaceKey: 'ROPS-SECRET',
      });

    expect(resConnectWorkspace.status).toBe(200);
    expect(Array.isArray(resConnectWorkspace.body.projects)).toBe(true);
    expect(resConnectWorkspace.body.projects.length).toBe(1);

    // 11. GET /api/v1/projects to see collaborator projects listing
    const resCollaboratorProjects = await request(app)
      .get(`/api/v1/projects?userId=${encodeURIComponent(collaboratorId)}&workspaceId=${encodeURIComponent(workspaceId)}`)
      .set('x-user-id', collaboratorId);

    expect(resCollaboratorProjects.status).toBe(200);
    expect(resCollaboratorProjects.body.length).toBe(1);

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

    // 13. POST /api/v1/workspaces/invites to create a peer guest invite (using x-user-id)
    const resCreateRevokedPeerInvite = await request(app)
      .post('/api/v1/workspaces/invites')
      .set('x-user-id', ownerId)
      .send({
        workspace_id: workspaceId,
        email: 'guest-user@peer.com',
        expiration_hours: 24,
      });

    expect(resCreateRevokedPeerInvite.status).toBe(201);
    expect(typeof resCreateRevokedPeerInvite.body.id).toBe('string');
    expect(typeof resCreateRevokedPeerInvite.body.invite_url).toBe('string');
    expect(typeof resCreateRevokedPeerInvite.body.validation_code).toBe('string');

    const peerInviteId = resCreateRevokedPeerInvite.body.id;
    const validationCode = resCreateRevokedPeerInvite.body.validation_code;
    const inviteUrl = resCreateRevokedPeerInvite.body.invite_url;

    // 14. GET /api/v1/workspaces/:id/peer-invites (Owner lists invites)
    const resPeerInvites = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/peer-invites`)
      .set('x-user-id', ownerId);

    expect(resPeerInvites.status).toBe(200);
    expect(Array.isArray(resPeerInvites.body)).toBe(true);
    expect(
      resPeerInvites.body.some(
        (invite: any) =>
          invite.email === 'guest-user@peer.com' && invite.validation_code === validationCode
      )
    ).toBe(true);

    // 15. GET /api/v1/workspaces/:id/peer-invites (Collaborator lists invites -> Forbidden 403)
    const resCollabPeerInvites = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/peer-invites`)
      .set('x-user-id', collaboratorId);

    expect(resCollabPeerInvites.status).toBe(403);

    // 16. POST /api/v1/workspaces/:id/peer-invites/:id/revoke to revoke guest invite
    const resRevokePeerInvite = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/peer-invites/${peerInviteId}/revoke`)
      .set('x-user-id', ownerId);

    expect(resRevokePeerInvite.status).toBe(200);
    expect(resRevokePeerInvite.body.revoked_at).toBeDefined();

    // 17. POST /api/v1/workspaces/validate to validate revoked code (should fail with 400)
    const resValidateRevoked = await request(app)
      .post('/api/v1/workspaces/validate')
      .send({
        email: 'guest-user@peer.com',
        validation_code: validationCode,
        invite_url: inviteUrl,
        username: 'GuestExpert',
        password_hash: '$2b$12$SecureBcryptHashHereForTestingOnly1234567890123456789012',
      });

    expect(resValidateRevoked.status).toBe(400);

    // 18. POST /api/v1/workspaces/invites to create a second peer invite
    const resCreateSecondPeerInvite = await request(app)
      .post('/api/v1/workspaces/invites')
      .set('x-user-id', ownerId)
      .send({
        workspace_id: workspaceId,
        email: 'guest-validated@peer.com',
        expiration_hours: 24,
      });

    expect(resCreateSecondPeerInvite.status).toBe(201);
    const secondInviteId = resCreateSecondPeerInvite.body.id;
    const secondValidationCode = resCreateSecondPeerInvite.body.validation_code;
    const secondInviteUrl = resCreateSecondPeerInvite.body.invite_url;

    // 19. POST /api/v1/workspaces/validate with invalid code (should fail with 401)
    const resValidateInvalid = await request(app)
      .post('/api/v1/workspaces/validate')
      .send({
        email: 'guest-validated@peer.com',
        validation_code: 'GRAV-0000-X',
        invite_url: secondInviteUrl,
        username: 'GuestExpert',
        password_hash: '$2b$12$InvalidHashForNegativePath',
      });

    expect(resValidateInvalid.status).toBe(401);

    // 20. POST /api/v1/workspaces/validate with valid code (should succeed with 200)
    const resValidateSuccess = await request(app)
      .post('/api/v1/workspaces/validate')
      .send({
        email: 'guest-validated@peer.com',
        validation_code: secondValidationCode,
        invite_url: secondInviteUrl,
        username: 'GuestExpert',
        password_hash: '$2b$12$SecureBcryptHashHereForTestingOnly1234567890123456789012',
      });

    expect(resValidateSuccess.status).toBe(200);
    expect(resValidateSuccess.body.authorized).toBe(true);
    expect(typeof resValidateSuccess.body.workspace_private_key).toBe('string');
    expect(resValidateSuccess.body.guest_profile.username).toBe('GuestExpert');

    const guestUserId = resValidateSuccess.body.guest_profile.id;
    const workspacePrivateKey = resValidateSuccess.body.workspace_private_key;

    // 21. GET /api/v1/workspaces?userId=:guestUserId to load guest workspaces
    const resGuestWorkspaces = await request(app)
      .get(`/api/v1/workspaces?userId=${encodeURIComponent(guestUserId)}`)
      .set('x-user-id', guestUserId);

    expect(resGuestWorkspaces.status).toBe(200);
    expect(resGuestWorkspaces.body.some((ws: any) => ws.id === workspaceId)).toBe(true);

    // 22. GET /api/v1/projects?userId=:guestUserId to load guest projects
    const resGuestProjects = await request(app)
      .get(`/api/v1/projects?userId=${encodeURIComponent(guestUserId)}&workspaceId=${encodeURIComponent(workspaceId)}`)
      .set('x-user-id', guestUserId);

    expect(resGuestProjects.status).toBe(200);
    expect(resGuestProjects.body.length).toBeGreaterThanOrEqual(1);

    // 23. GET /api/v1/projects with invalid Workspace-Key (should return 401)
    const resInvalidKeyProjects = await request(app)
      .get('/api/v1/projects')
      .set('X-Workspace-Key', 'sec_wsp_invalid');

    expect(resInvalidKeyProjects.status).toBe(401);

    // 24. GET /api/v1/projects with valid Workspace-Key (should succeed)
    const resScopedProjects = await request(app)
      .get('/api/v1/projects')
      .set('X-Workspace-Key', workspacePrivateKey);

    expect(resScopedProjects.status).toBe(200);
    expect(resScopedProjects.body.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(resScopedProjects.body[0].domains)).toBe(true);
    expect(Array.isArray(resScopedProjects.body[0].cycles)).toBe(true);

    // 25. POST /api/v1/tickets to create a scoped ticket
    const resCreateTicket = await request(app)
      .post('/api/v1/tickets')
      .set('x-user-id', ownerId)
      .set('X-Project-Id', defaultProjectId)
      .send({
        title: 'Scoped guest comment target',
        description: 'Target ticket for peer validation flows.',
        projectId: defaultProjectId,
      });

    expect(resCreateTicket.status).toBe(201);
    const ticketId = resCreateTicket.body.id;

    // 26. POST /api/v1/tickets/:id/comments with X-Workspace-Key
    const resCreateComment = await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('X-Workspace-Key', workspacePrivateKey)
      .send({
        content: 'Optimistic UI rendering test comment.',
      });

    expect(resCreateComment.status).toBe(201);
    expect(resCreateComment.body.body).toBe('Optimistic UI rendering test comment.');
    expect(resCreateComment.body.author.username).toBe('GuestExpert');
    expect(resCreateComment.body.author.role).toBe('guest_contributor');

    // 27. GET /api/v1/tickets/:id/comments with X-Workspace-Key
    const resGetComments = await request(app)
      .get(`/api/v1/tickets/${ticketId}/comments`)
      .set('X-Workspace-Key', workspacePrivateKey);

    expect(resGetComments.status).toBe(200);
    expect(resGetComments.body.some((c: any) => c.author?.username === 'GuestExpert')).toBe(true);

    // 28. POST /api/v1/workspaces/:id/peer-invites/:id/revoke (Revoke validated guest access)
    const resRevokeValidated = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/peer-invites/${secondInviteId}/revoke`)
      .set('x-user-id', ownerId);

    expect(resRevokeValidated.status).toBe(200);
    expect(resRevokeValidated.body.revoked_at).toBeDefined();

    // 29. GET /api/v1/projects with revoked Workspace-Key (should return 401)
    const resRevokedKeyProjects = await request(app)
      .get('/api/v1/projects')
      .set('X-Workspace-Key', workspacePrivateKey);

    expect(resRevokedKeyProjects.status).toBe(401);

    // 30. GET /api/v1/workspaces?userId=:guestUserId (Revoked guest should see no workspaces)
    const resRevokedGuestWorkspaces = await request(app)
      .get(`/api/v1/workspaces?userId=${encodeURIComponent(guestUserId)}`)
      .set('x-user-id', guestUserId);

    expect(resRevokedGuestWorkspaces.status).toBe(200);
    expect(resRevokedGuestWorkspaces.body.length).toBe(0);

    // 31. GET /api/v1/projects?userId=:guestUserId (Revoked guest should see no projects)
    const resRevokedGuestProjects = await request(app)
      .get(`/api/v1/projects?userId=${encodeURIComponent(guestUserId)}&workspaceId=${encodeURIComponent(workspaceId)}`)
      .set('x-user-id', guestUserId);

    expect(resRevokedGuestProjects.status).toBe(200);
    expect(resRevokedGuestProjects.body.length).toBe(0);

    // 32. GET /api/v1/workspaces/:id/peer-invites (Verify peer-invites reflects revoked_at)
    const resPeerInvitesFinal = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/peer-invites`)
      .set('x-user-id', ownerId);

    expect(resPeerInvitesFinal.status).toBe(200);
    expect(
      resPeerInvitesFinal.body.some(
        (invite: any) => invite.id === secondInviteId && typeof invite.revoked_at === 'string'
      )
    ).toBe(true);
  });
});
