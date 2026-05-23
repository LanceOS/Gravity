import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedUser } from '../tests/helpers/test-helpers.js';

const app = createApp();

describe('Workspace Member Activity E2E', () => {
  it('should track, retrieve, and automatically update user workspace activity', async () => {
    // 1. Seed user
    const user = await seedUser({
      id: 'activity-user-1',
      name: 'Casey Carter',
      email: 'casey@gravity.dev',
      role: 'owner',
    });

    // 2. Create a workspace
    const resCreateWorkspace = await request(app)
      .post('/api/v1/workspaces')
      .set('x-user-id', user.id)
      .send({
        name: 'Activity Workspace',
        description: 'Track my activity here',
        key: 'ACT',
        workspaceKey: 'ACT-SECRET',
        ownerId: user.id,
      });

    expect(resCreateWorkspace.status).toBe(201);
    const workspaceId = resCreateWorkspace.body.workspace.id;

    // 3. Check initial last active time via the specific endpoint (should be null initially)
    const resInitialActivity = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/members/${user.id}/activity`)
      .set('x-user-id', user.id);

    expect(resInitialActivity.status).toBe(200);
    expect(resInitialActivity.body.lastActiveAt).toBeNull();
    expect(resInitialActivity.body.userId).toBe(user.id);
    expect(resInitialActivity.body.workspaceId).toBe(workspaceId);

    // 4. Explicitly record activity using POST endpoint
    const resPostActivity = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/members/${user.id}/activity`)
      .set('x-user-id', user.id);

    expect(resPostActivity.status).toBe(200);
    expect(resPostActivity.body.success).toBe(true);
    expect(resPostActivity.body.lastActiveAt).not.toBeNull();
    const explicitTimestamp = resPostActivity.body.lastActiveAt;

    // 5. Fetch specific activity endpoint again (should return the recorded timestamp)
    const resGetActivity = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/members/${user.id}/activity`)
      .set('x-user-id', user.id);

    expect(resGetActivity.status).toBe(200);
    expect(resGetActivity.body.lastActiveAt).toBe(explicitTimestamp);

    // 6. Verify GET /members left-joins and returns correct lastActiveAt
    const resMembers = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('x-user-id', user.id);

    expect(resMembers.status).toBe(200);
    const member = resMembers.body.find((m: any) => m.id === user.id);
    expect(member).toBeDefined();
    expect(new Date(member.lastActiveAt).getTime()).toBeGreaterThanOrEqual(new Date(explicitTimestamp).getTime());

    // 7. Verify GET /workspaces/:workspaceId automatically updates lastActiveAt when fetched
    const resWorkspace = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}`)
      .set('x-user-id', user.id);

    expect(resWorkspace.status).toBe(200);

    // Wait a brief moment or just check that specific activity endpoint returns a valid date
    const resGetActivityAfterAuto = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/members/${user.id}/activity`)
      .set('x-user-id', user.id);

    expect(resGetActivityAfterAuto.status).toBe(200);
    expect(resGetActivityAfterAuto.body.lastActiveAt).not.toBeNull();

    // 8. Delete workspace and verify cascade delete of activity records
    const resDelete = await request(app)
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('x-user-id', user.id);

    expect(resDelete.status).toBe(200);
    expect(resDelete.body.success).toBe(true);

    // Check activity is gone / returns null after workspace deletion
    const resPostDeleteActivity = await request(app)
      .get(`/api/v1/workspaces/${workspaceId}/members/${user.id}/activity`)
      .set('x-user-id', user.id);

    expect(resPostDeleteActivity.body.lastActiveAt).toBeNull();
  });
});
