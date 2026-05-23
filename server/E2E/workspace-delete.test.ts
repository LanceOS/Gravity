import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedUser } from '../tests/helpers/test-helpers.js';

const app = createApp();

describe('Workspace Deletion E2E', () => {
  it('should prevent non-owners from deleting a workspace', async () => {
    // 1. Seed owner and contributor
    const owner = await seedUser({
      id: 'owner-del-1',
      name: 'Owner',
      email: 'owner-del@gravity.dev',
      role: 'owner',
    });

    const contributor = await seedUser({
      id: 'collab-del-1',
      name: 'Contributor',
      email: 'collab-del@gravity.dev',
      role: 'guest_contributor',
    });

    // 2. Create workspace as owner
    const resCreateWorkspace = await request(app)
      .post('/api/v1/workspaces')
      .set('x-user-id', owner.id)
      .send({
        name: 'Deletion Target',
        description: 'Workspace to be deleted',
        key: 'DEL',
        workspaceKey: 'DEL-SECRET',
        ownerId: owner.id,
      });

    expect(resCreateWorkspace.status).toBe(201);
    const workspaceId = resCreateWorkspace.body.workspace.id;

    // 3. Invite the contributor
    const resCreateInvite = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/invites`)
      .set('x-user-id', owner.id)
      .send({
        createdBy: owner.id,
        label: 'Contributor invite',
      });
    const inviteCode = resCreateInvite.body.code;

    // 4. Contributor requests to join
    const resJoinRequest = await request(app)
      .post(`/api/v1/workspaces/invites/${inviteCode}/join-requests`)
      .set('x-user-id', contributor.id)
      .send({
        userId: contributor.id,
        message: 'Let me in',
      });
    const joinRequestId = resJoinRequest.body.id;

    // 5. Owner approves join request
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/join-requests/${joinRequestId}/approve`)
      .set('x-user-id', owner.id)
      .send({
        reviewerUserId: owner.id,
      });

    // 6. Contributor attempts to delete the workspace (should fail)
    const resDeleteFail = await request(app)
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('x-user-id', contributor.id);

    expect(resDeleteFail.status).toBe(403);
    expect(resDeleteFail.body.error).toBe('Only a workspace owner can delete the workspace.');

    // 7. Owner deletes the workspace (should succeed)
    const resDeleteSuccess = await request(app)
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('x-user-id', owner.id);

    expect(resDeleteSuccess.status).toBe(200);
    expect(resDeleteSuccess.body.success).toBe(true);

    // 8. Verify workspace is gone
    const resFinalWorkspaces = await request(app)
      .get(`/api/v1/workspaces?userId=${owner.id}`)
      .set('x-user-id', owner.id);

    expect(resFinalWorkspaces.body.some((ws: any) => ws.id === workspaceId)).toBe(false);
  });

  it('should return 403 when trying to delete an invalid workspace id', async () => {
    const owner = await seedUser({
      id: 'owner-del-invalid',
      name: 'Owner Invalid',
      email: 'owner-inv@gravity.dev',
      role: 'owner',
    });

    const resDeleteFail = await request(app)
      .delete(`/api/v1/workspaces/invalid_workspace_id`)
      .set('x-user-id', owner.id);

    // It returns 403 because no membership record is found for invalid_workspace_id
    expect(resDeleteFail.status).toBe(403);
    expect(resDeleteFail.body.error).toBe('Only a workspace owner can delete the workspace.');
  });
});
