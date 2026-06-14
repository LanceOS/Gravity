import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { RustFS } from '../src/lib/rustfs.js';
import { teams, projects, cycles, labels, noteMetadata, ticketLabels, tickets, workspaceMembers, workspaces } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { createAuthenticatedApi, seedWorkspaceFixture, seedTicket } from './helpers/test-helpers.js';

describe('teams integration tests', () => {
  it('creates, lists, updates, and deletes teams with project reassignment', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Team Owner',
      email: 'team-owner@example.com',
      role: 'owner',
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
    });

    // 1. Create a Team
    const createResponse = await ownerApi
      .post('/api/v1/teams')
      .send({
        workspaceId: workspace.id,
        name: 'Engineering Team',
        description: 'Primary engineering team',
        color: '#3B82F6',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      name: 'Engineering Team',
      description: 'Primary engineering team',
      color: '#3B82F6',
      workspaceId: workspace.id,
    });

    const team1Id = createResponse.body.id;

    const getResponse = await ownerApi.get(`/api/v1/teams/${team1Id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toMatchObject({
      id: team1Id,
      workspaceId: workspace.id,
      name: 'Engineering Team',
    });

    // 2. List Teams for Workspace
    const listResponse = await ownerApi.get('/api/v1/teams').query({ workspaceId: workspace.id });
    expect(listResponse.status).toBe(200);
    // General default team + the newly created Engineering Team
    expect(listResponse.body).toHaveLength(2);
    expect(listResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: team1Id, name: 'Engineering Team' }),
        expect.objectContaining({ name: 'General' }),
      ]),
    );

    // 3. Update Team Details
    const patchResponse = await ownerApi
      .patch(`/api/v1/teams/${team1Id}`)
      .send({
        name: 'Core Engineering',
        color: '#10B981',
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      id: team1Id,
      name: 'Core Engineering',
      color: '#10B981',
    });

    // 4. Create another Team for reassignment
    const createResponse2 = await ownerApi
      .post('/api/v1/teams')
      .send({
        workspaceId: workspace.id,
        name: 'Design Team',
        description: 'Product design team',
        color: '#EC4899',
      });
    expect(createResponse2.status).toBe(201);
    const team2Id = createResponse2.body.id;

    // Assign project to team1
    await db.update(projects).set({ teamId: team1Id }).where(eq(projects.id, project.id));

    const cycleResponse = await ownerApi.post('/api/v1/cycles').send({
      teamId: team1Id,
      name: 'Engineering Sprint',
      startDate: new Date('2026-06-01').toISOString(),
      endDate: new Date('2026-06-08').toISOString(),
    });
    expect(cycleResponse.status).toBe(201);

    const labelResponse = await ownerApi.post('/api/v1/labels').send({
      teamId: team1Id,
      name: 'Engineering Label',
      color: '#2563EB',
    });
    expect(labelResponse.status).toBe(201);

    // 5. Try deleting team1 (should block because a project is associated)
    const deleteBlockedResponse = await ownerApi.delete(`/api/v1/teams/${team1Id}`);
    expect(deleteBlockedResponse.status).toBe(400);
    expect(deleteBlockedResponse.body.error).toContain('Cannot delete team: projects, cycles, or labels still reference it');

    // 6. Delete team1 with project reassignment to team2
    const deleteSuccessResponse = await ownerApi
      .delete(`/api/v1/teams/${team1Id}`)
      .query({ reassignTeamId: team2Id });

    expect(deleteSuccessResponse.status).toBe(200);
    expect(deleteSuccessResponse.body).toEqual({ success: true });

    // Verify project is now assigned to team2
    const projectRows = await db.select().from(projects).where(eq(projects.id, project.id)).limit(1);
    expect(projectRows[0]?.teamId).toBe(team2Id);

    const cycleRows = await db.select().from(cycles).where(eq(cycles.id, cycleResponse.body.id)).limit(1);
    expect(cycleRows[0]?.teamId).toBe(team2Id);

    const labelRows = await db.select().from(labels).where(eq(labels.id, labelResponse.body.id)).limit(1);
    expect(labelRows[0]?.teamId).toBe(team2Id);

    // Verify team1 is deleted
    const team1Rows = await db.select().from(teams).where(eq(teams.id, team1Id)).limit(1);
    expect(team1Rows).toHaveLength(0);
  });

  it('deletes the last team and its owned work when no reassignment target exists', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Last Team Owner',
      email: 'last-team-owner@example.com',
      role: 'owner',
    });

    const createWorkspaceResponse = await ownerApi.post('/api/v1/workspaces').send({
      name: 'Team Workspace',
      description: 'Starts empty',
      key: 'TWX',
      hierarchyMode: 'teams',
    });

    expect(createWorkspaceResponse.status).toBe(201);
    const workspace = createWorkspaceResponse.body.workspace;

    const createTeamResponse = await ownerApi
      .post('/api/v1/teams')
      .send({
        workspaceId: workspace.id,
        name: 'Platform Team',
        description: 'Owns the core platform',
        color: '#3B82F6',
      });
    expect(createTeamResponse.status).toBe(201);
    const teamId = createTeamResponse.body.id;

    const createProjectResponse = await ownerApi
      .post('/api/v1/projects')
      .send({
        workspaceId: workspace.id,
        teamId,
        name: 'Platform Project',
        key: 'PLT',
        description: 'Primary platform delivery project',
        status: 'active',
      });
    expect(createProjectResponse.status).toBe(201);
    const projectId = createProjectResponse.body.id;

    const cycleResponse = await ownerApi.post('/api/v1/cycles').send({
      teamId,
      name: 'Platform Sprint',
      startDate: new Date('2026-06-01').toISOString(),
      endDate: new Date('2026-06-08').toISOString(),
    });
    expect(cycleResponse.status).toBe(201);

    const teamLabelResponse = await ownerApi.post('/api/v1/labels').send({
      teamId,
      name: 'Platform Label',
      color: '#2563EB',
    });
    expect(teamLabelResponse.status).toBe(201);

    const ticketResponse = await ownerApi
      .post('/api/v1/tickets')
      .set('X-Project-Id', projectId)
      .send({
        title: 'Ship platform milestone',
        description: 'Make sure the core path stays green.',
      });
    expect(ticketResponse.status).toBe(201);
    const ticketId = ticketResponse.body.id;

    const criticalLabelResponse = await ownerApi
      .post('/api/v1/labels')
      .set('X-Project-Id', projectId)
      .send({
        name: 'Critical',
        color: '#DC2626',
      });
    expect(criticalLabelResponse.status).toBe(201);
    const labelId = criticalLabelResponse.body.id;

    const ticketLabelResponse = await ownerApi
      .post(`/api/v1/tickets/${ticketId}/labels`)
      .send({ labelId });
    expect(ticketLabelResponse.status).toBe(201);

    const noteResponse = await ownerApi
      .post('/api/v1/notes')
      .set('X-Project-Id', projectId)
      .send({
        title: 'Runbook',
        body: '# Runbook\nDelete-safe notes.',
      });
    expect(noteResponse.status).toBe(201);
    const noteBucketPath = noteResponse.body.bucketPath as string;

    const deleteResponse = await ownerApi.delete(`/api/v1/teams/${teamId}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ success: true });

    const workspaceRows = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id)).limit(1);
    expect(workspaceRows[0]?.defaultProjectId).toBeNull();

    const teamRows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    expect(teamRows).toHaveLength(0);

    const projectRows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    expect(projectRows).toHaveLength(0);

    const cycleRows = await db.select().from(cycles).where(eq(cycles.id, cycleResponse.body.id)).limit(1);
    expect(cycleRows).toHaveLength(0);

    const teamLabelRows = await db.select().from(labels).where(eq(labels.id, teamLabelResponse.body.id)).limit(1);
    expect(teamLabelRows).toHaveLength(0);

    const criticalLabelRows = await db.select().from(labels).where(eq(labels.id, criticalLabelResponse.body.id)).limit(1);
    expect(criticalLabelRows).toHaveLength(0);

    const ticketRows = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    expect(ticketRows).toHaveLength(0);

    const labelRows = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);
    expect(labelRows).toHaveLength(0);

    const ticketLabelRows = await db.select().from(ticketLabels).where(eq(ticketLabels.ticketId, ticketId)).limit(1);
    expect(ticketLabelRows).toHaveLength(0);

    const noteRows = await db.select().from(noteMetadata).where(eq(noteMetadata.projectId, projectId)).limit(1);
    expect(noteRows).toHaveLength(0);

    expect(await RustFS.listFiles(noteBucketPath)).toHaveLength(0);
  });

  it('queries team-scoped cycles, labels, and tickets via scope strategies', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Ticket Scoper',
      email: 'ticket-scoper@example.com',
      role: 'owner',
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
    });

    // Create team
    const teamRes = await ownerApi
      .post('/api/v1/teams')
      .send({
        workspaceId: workspace.id,
        name: 'QA Team',
      });
    expect(teamRes.status).toBe(201);
    const teamId = teamRes.body.id;

    // Assign project to team
    await db.update(projects).set({ teamId }).where(eq(projects.id, project.id));

    // Create team cycle
    const cycleRes = await ownerApi
      .post('/api/v1/cycles')
      .send({
        teamId,
        name: 'Team Sprint 1',
        startDate: new Date('2026-06-01').toISOString(),
        endDate: new Date('2026-06-08').toISOString(),
      });
    expect(cycleRes.status).toBe(201);
    const cycleId = cycleRes.body.id;

    // Create team label
    const labelRes = await ownerApi
      .post('/api/v1/labels')
      .send({
        teamId,
        name: 'Team Label 1',
        color: '#EAB308',
      });
    expect(labelRes.status).toBe(201);
    const labelId = labelRes.body.id;

    // Seed tickets
    const ticket1 = await seedTicket(project.id, {
      id: 'ticket-qa-1',
      key: `${project.key}-1`,
      title: 'Task 1 in QA',
      cycleId,
      labelIds: [labelId],
    });
    const ticket2 = await seedTicket(project.id, {
      id: 'ticket-qa-2',
      key: `${project.key}-2`,
      title: 'Task 2 in QA',
    });

    // Query team tickets
    const ticketsRes = await ownerApi.get('/api/v1/tickets').query({ teamId });
    expect(ticketsRes.status).toBe(200);
    expect(ticketsRes.body).toHaveLength(2);
    expect(ticketsRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ticket1.id, title: 'Task 1 in QA' }),
        expect.objectContaining({ id: ticket2.id, title: 'Task 2 in QA' }),
      ]),
    );

    // Query team cycles
    const cyclesRes = await ownerApi.get('/api/v1/cycles').query({ teamId });
    expect(cyclesRes.status).toBe(200);
    expect(cyclesRes.body).toHaveLength(1);
    expect(cyclesRes.body[0].name).toBe('Team Sprint 1');

    // Query team labels
    const labelsRes = await ownerApi.get('/api/v1/labels').query({ teamId });
    expect(labelsRes.status).toBe(200);
    expect(labelsRes.body).toHaveLength(1);
    expect(labelsRes.body[0].name).toBe('Team Label 1');
  });

  it('requires workspace ownership to mutate teams', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Team Mutation Owner',
      email: 'team-mutation-owner@example.com',
      role: 'owner',
    });
    const memberApi = await createAuthenticatedApi({
      name: 'Team Mutation Member',
      email: 'team-mutation-member@example.com',
      role: 'member',
    });

    const owner = ownerApi.user;
    const member = memberApi.user;
    const { workspace } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
    });

    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: member.id,
      role: 'member',
      provisionedByValidationId: null,
      createdAt: new Date(),
    });

    const ownerCreateRes = await ownerApi.post('/api/v1/teams').send({
      workspaceId: workspace.id,
      name: 'Owner Created Team',
    });
    expect(ownerCreateRes.status).toBe(201);
    const teamId = ownerCreateRes.body.id;

    const memberListRes = await memberApi.get('/api/v1/teams').query({ workspaceId: workspace.id });
    expect(memberListRes.status).toBe(200);

    const memberGetRes = await memberApi.get(`/api/v1/teams/${teamId}`);
    expect(memberGetRes.status).toBe(200);

    const memberCreateRes = await memberApi.post('/api/v1/teams').send({
      workspaceId: workspace.id,
      name: 'Member Created Team',
    });
    expect(memberCreateRes.status).toBe(403);
    expect(memberCreateRes.body.error).toContain('Only workspace owners');

    const memberPatchRes = await memberApi.patch(`/api/v1/teams/${teamId}`).send({
      name: 'Member Renamed Team',
    });
    expect(memberPatchRes.status).toBe(403);
    expect(memberPatchRes.body.error).toContain('Only workspace owners');

    const memberDeleteRes = await memberApi.delete(`/api/v1/teams/${teamId}`);
    expect(memberDeleteRes.status).toBe(403);
    expect(memberDeleteRes.body.error).toContain('Only workspace owners');
  });
});
