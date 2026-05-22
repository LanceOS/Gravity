import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedUser } from '../tests/helpers/test-helpers.js';

const app = createApp();

describe('Server Projects & Tickets Flow E2E', () => {
  it('should successfully execute the complete project membership and ticket lifecycle', async () => {
    // 1. Seed three active users using the test helper
    const jane = await seedUser({
      id: 'jane-1',
      name: 'Jane Tester',
      email: 'jane@gravity.dev',
      role: 'owner',
    });

    const alice = await seedUser({
      id: 'alice-1',
      name: 'Alice Agent',
      email: 'alice@gravity.dev',
      role: 'developer',
    });

    const bob = await seedUser({
      id: 'bob-1',
      name: 'Bob Builder',
      email: 'bob@gravity.dev',
      role: 'guest_contributor',
    });

    const janeId = jane.id;
    const aliceId = alice.id;
    const bobId = bob.id;

    // 2. POST /api/v1/projects to create a project on behalf of Jane
    const resCreateProject = await request(app)
      .post('/api/v1/projects')
      .set('x-user-id', janeId)
      .send({
        name: 'Sandboxed Test',
        description: 'A project for validation and testing',
        key: 'TST',
        status: 'active',
        ownerId: janeId,
      });

    expect(resCreateProject.status).toBe(201);
    expect(resCreateProject.body.key).toBe('TST');
    expect(typeof resCreateProject.body.inviteCode).toBe('string');
    
    const projectId = resCreateProject.body.id;
    const inviteCode = resCreateProject.body.inviteCode;
    expect(projectId).toBeDefined();

    // 3. POST /api/v1/projects/invite/accept (Alice joins using invite code)
    const resAcceptInvite = await request(app)
      .post('/api/v1/projects/invite/accept')
      .set('x-user-id', aliceId)
      .send({
        inviteCode,
        userId: aliceId,
      });

    expect(resAcceptInvite.status).toBe(200);
    expect(resAcceptInvite.body.project.key).toBe('TST');

    // 4. POST /api/v1/projects/:id/members to manually assign Bob with developer role
    const resAddMember = await request(app)
      .post(`/api/v1/projects/${projectId}/members`)
      .set('x-user-id', janeId)
      .send({
        userId: bobId,
        role: 'developer',
      });

    expect(resAddMember.status).toBe(201);
    expect(resAddMember.body.success).toBe(true);

    // Verify members are listed
    const resListMembers = await request(app)
      .get(`/api/v1/users?projectId=${encodeURIComponent(projectId)}`)
      .set('x-user-id', janeId);

    expect(resListMembers.status).toBe(200);
    expect(Array.isArray(resListMembers.body)).toBe(true);
    expect(resListMembers.body.some((member: any) => member.id === bobId)).toBe(true);
    expect(resListMembers.body.some((member: any) => member.id === aliceId)).toBe(true);

    // 5. POST /api/v1/tickets to create a ticket on behalf of Jane in project TST
    const resCreateTicket = await request(app)
      .post('/api/v1/tickets')
      .set('x-user-id', janeId)
      .set('X-Project-Id', projectId)
      .send({
        title: 'Implement database encryption',
        description: 'Secure sensitive database tables.',
        status: 'todo',
        priority: 'high',
        projectId,
        assigneeId: bobId,
      });

    expect(resCreateTicket.status).toBe(201);
    expect(resCreateTicket.body.key.startsWith('TST-')).toBe(true);
    
    const ticketId = resCreateTicket.body.id;
    const ticketKey = resCreateTicket.body.key;
    expect(ticketId).toBeDefined();

    // 6. GET /api/v1/tickets to list tickets under project TST
    const resListTickets = await request(app)
      .get(`/api/v1/tickets?projectId=${encodeURIComponent(projectId)}`)
      .set('x-user-id', janeId);

    expect(resListTickets.status).toBe(200);
    expect(Array.isArray(resListTickets.body)).toBe(true);
    expect(resListTickets.body.some((t: any) => t.id === ticketId)).toBe(true);

    // 7. PATCH /api/v1/tickets/:id to update ticket status and description
    const resPatchTicket = await request(app)
      .patch(`/api/v1/tickets/${ticketId}`)
      .set('x-user-id', janeId)
      .set('X-Project-Id', projectId)
      .send({
        status: 'in_progress',
        priority: 'urgent',
        description: 'Updated ticket description text.',
      });

    expect(resPatchTicket.status).toBe(200);
    expect(resPatchTicket.body.status).toBe('in_progress');
    expect(resPatchTicket.body.priority).toBe('urgent');
    expect(resPatchTicket.body.description).toBe('Updated ticket description text.');

    // 8. Create a sub-ticket: POST /api/v1/tickets pointing to parentId
    const resCreateSubTicket = await request(app)
      .post('/api/v1/tickets')
      .set('x-user-id', janeId)
      .set('X-Project-Id', projectId)
      .send({
        title: 'Implement database keys checks',
        projectId,
        parentId: ticketId,
      });

    expect(resCreateSubTicket.status).toBe(201);
    expect(resCreateSubTicket.body.parentId).toBe(ticketId);
    
    const subTicketId = resCreateSubTicket.body.id;

    // 9. GET /api/v1/tickets/:id to check details of parent ticket including sub-tickets
    const resParentDetails = await request(app)
      .get(`/api/v1/tickets/${ticketId}?projectId=${encodeURIComponent(projectId)}`)
      .set('x-user-id', janeId);

    expect(resParentDetails.status).toBe(200);
    const subtaskList = Array.isArray(resParentDetails.body.subTickets) 
      ? resParentDetails.body.subTickets 
      : resParentDetails.body.subtasks;
    expect(Array.isArray(subtaskList)).toBe(true);
    expect(subtaskList.some((t: any) => t.id === subTicketId)).toBe(true);

    // 10. POST /api/v1/tickets/:id/comments to post a comment
    const resCreateComment = await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('x-user-id', janeId)
      .set('X-Project-Id', projectId)
      .send({
        userId: janeId,
        body: 'Jane posted a test comment here.',
      });

    expect(resCreateComment.status).toBe(201);
    expect(resCreateComment.body.body).toBe('Jane posted a test comment here.');
    expect(resCreateComment.body.author.username).toBe('Jane Tester');
    expect(resCreateComment.body.author.role).toBe('owner');

    // 11. GET /api/v1/tickets/:id/comments to load all comments
    const resGetComments = await request(app)
      .get(`/api/v1/tickets/${ticketId}/comments`)
      .set('X-Project-Id', projectId)
      .set('x-user-id', janeId);

    expect(resGetComments.status).toBe(200);
    expect(Array.isArray(resGetComments.body)).toBe(true);
    expect(resGetComments.body.some((c: any) => c.body === 'Jane posted a test comment here.')).toBe(true);

    // 12. DELETE /api/v1/tickets/:id to delete the sub-ticket
    const resDeleteSubTicket = await request(app)
      .delete(`/api/v1/tickets/${subTicketId}?projectId=${encodeURIComponent(projectId)}`)
      .set('x-user-id', janeId);

    expect(resDeleteSubTicket.status).toBe(200);
    expect(resDeleteSubTicket.body.success).toBe(true);

    // 13. Verify deleted sub-ticket yields 404
    const resVerifyDeleted = await request(app)
      .get(`/api/v1/tickets/${subTicketId}?projectId=${encodeURIComponent(projectId)}`)
      .set('x-user-id', janeId);

    expect(resVerifyDeleted.status).toBe(404);
  });
});
