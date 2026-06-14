import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { projects } from '../src/db/schema.js';

describe('ticket move route', () => {
  it('moves a ticket to another project in the same workspace', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Move Owner',
      email: 'move-owner@example.com',
      role: 'owner',
    });
    const owner = ownerApi.user;
    const { workspace, project: sourceProject } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
    });

    const teamRows = await db
      .select({ teamId: projects.teamId })
      .from(projects)
      .where(eq(projects.id, sourceProject.id))
      .limit(1);
    const teamId = teamRows[0]?.teamId;
    if (!teamId) {
      throw new Error('Expected source project to have a team assignment.');
    }

    const targetProjectId = 'project-move-target';
    await db.insert(projects).values({
      id: targetProjectId,
      workspaceId: workspace.id,
      teamId,
      name: 'Move Target',
      description: 'Destination project',
      key: 'MOV',
      status: 'active',
      inviteCode: 'INV-MOV-0001',
      createdBy: owner.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const createTicketResponse = await ownerApi.post('/api/v1/tickets').send({
      projectId: sourceProject.id,
      title: 'Move me',
      description: 'Ticket that should move between projects.',
      priority: 'medium',
    });

    expect(createTicketResponse.status).toBe(201);

    const moveResponse = await ownerApi
      .patch(`/api/v1/tickets/${createTicketResponse.body.id}`)
      .set('x-project-id', sourceProject.id)
      .send({ projectId: targetProjectId });

    expect(moveResponse.status).toBe(200);
    expect(moveResponse.body).toMatchObject({
      id: createTicketResponse.body.id,
      projectId: targetProjectId,
      key: createTicketResponse.body.key,
    });

    const sourceTickets = await ownerApi.get('/api/v1/tickets').query({ projectId: sourceProject.id });
    expect(sourceTickets.status).toBe(200);
    expect(sourceTickets.body).toHaveLength(0);

    const targetTickets = await ownerApi.get('/api/v1/tickets').query({ projectId: targetProjectId });
    expect(targetTickets.status).toBe(200);
    expect(targetTickets.body).toEqual([
      expect.objectContaining({
        id: createTicketResponse.body.id,
        projectId: targetProjectId,
      }),
    ]);
  });
});
