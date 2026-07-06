import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import { ticketRelationships } from '../src/db/schema.js';
import {
  createAuthenticatedApi,
  seedTicket,
  seedWorkspaceFixture,
} from './helpers/test-helpers.js';

describe('ticket relationship routes', () => {
  it('manages ticket dependencies and blockers and enforces validation rules', { timeout: 10_000 }, async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Margaret Hamilton',
      email: 'margaret@example.com',
      role: 'owner',
    });
    
    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    // Seed four tickets so we can exercise both dependency and blocker links.
    const t1 = await seedTicket(project.id, {
      id: 'ticket-dep-1',
      key: 'GRV-1',
      title: 'Dependent ticket 1',
      description: 'Waiting on blockers',
      priority: 'medium',
    });

    const t2 = await seedTicket(project.id, {
      id: 'ticket-dep-2',
      key: 'GRV-2',
      title: 'Dependency blocker 2',
      description: 'First blocker',
      priority: 'high',
    });

    const t3 = await seedTicket(project.id, {
      id: 'ticket-dep-3',
      key: 'GRV-3',
      title: 'Blocker 3',
      description: 'First blocker',
      priority: 'low',
    });

    const t4 = await seedTicket(project.id, {
      id: 'ticket-dep-4',
      key: 'GRV-4',
      title: 'Blocker 4',
      description: 'Second blocker',
      priority: 'high',
    });

    // 1. Initially, no dependencies or blockers should exist on details.
    const initT1Details = await ownerApi
      .get(`/api/v1/tickets/${t1.id}`)
      .query({ projectId: project.id });
    expect(initT1Details.status).toBe(200);
    expect(initT1Details.body.dependencies).toEqual([]);
    expect(initT1Details.body.blockers).toEqual([]);

    // 2. Add T2 as a dependency of T1 (T1 blocks T2)
    const addDepResponse = await ownerApi
      .post(`/api/v1/tickets/${t1.id}/dependencies`)
      .set('x-project-id', 'project-does-not-matter')
      .send({ dependencyId: t2.id });
    expect(addDepResponse.status).toBe(201);
    expect(addDepResponse.body).toEqual({ success: true });

    // Verify T1 has dependency T2
    const t1DetailsAfterAdd = await ownerApi
      .get(`/api/v1/tickets/${t1.id}`)
      .query({ projectId: project.id });
    expect(t1DetailsAfterAdd.status).toBe(200);
    expect(t1DetailsAfterAdd.body.dependencies).toEqual([
      expect.objectContaining({ id: t2.id, key: t2.key, title: t2.title }),
    ]);

    // Verify T2 is blocked by T1
    const t2DetailsAfterAdd = await ownerApi
      .get(`/api/v1/tickets/${t2.id}`)
      .query({ projectId: project.id });
    expect(t2DetailsAfterAdd.status).toBe(200);
    expect(t2DetailsAfterAdd.body.blockers).toEqual([
      expect.objectContaining({ id: t1.id, key: t1.key, title: t1.title }),
    ]);

    const listAfterDependencyAdd = await ownerApi.get('/api/v1/tickets').query({ projectId: project.id });
    expect(listAfterDependencyAdd.status).toBe(200);
    expect(listAfterDependencyAdd.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: t1.id, isDependency: true, isBlocked: false }),
      expect.objectContaining({ id: t2.id, isBlocked: true, isDependency: false }),
    ]));

    // 3. Add two blockers to T1 so we cover the many-to-many blocker side.
    const addBlockerResponse = await ownerApi
      .post(`/api/v1/tickets/${t1.id}/blockers`)
      .set('x-project-id', project.id)
      .send({ blockerId: t3.id });
    expect(addBlockerResponse.status).toBe(201);
    expect(addBlockerResponse.body).toEqual({ success: true });

    const addSecondBlockerResponse = await ownerApi
      .post(`/api/v1/tickets/${t1.id}/blockers`)
      .set('x-project-id', project.id)
      .send({ blockerId: t4.id });
    expect(addSecondBlockerResponse.status).toBe(201);
    expect(addSecondBlockerResponse.body).toEqual({ success: true });

    const t1DetailsAfterBlockers = await ownerApi
      .get(`/api/v1/tickets/${t1.id}`)
      .query({ projectId: project.id });
    expect(t1DetailsAfterBlockers.status).toBe(200);
    expect(t1DetailsAfterBlockers.body.blockers).toHaveLength(2);
    expect(t1DetailsAfterBlockers.body.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: t3.id, key: t3.key, title: t3.title }),
      expect.objectContaining({ id: t4.id, key: t4.key, title: t4.title }),
    ]));

    const relationSnapshotResponse = await ownerApi
      .get(`/api/v1/tickets/key/${t1.key}`)
      .query({ include: 'relations' });
    expect(relationSnapshotResponse.status).toBe(200);
    expect(relationSnapshotResponse.body.dependencies).toEqual([
      expect.objectContaining({ id: t2.id, key: t2.key, title: t2.title }),
    ]);
    expect(relationSnapshotResponse.body.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: t3.id, key: t3.key, title: t3.title }),
      expect.objectContaining({ id: t4.id, key: t4.key, title: t4.title }),
    ]));
    expect(relationSnapshotResponse.body.relatedTicketIds).toEqual(expect.arrayContaining([t2.id, t3.id, t4.id]));

    const t3DetailsAfterAdd = await ownerApi
      .get(`/api/v1/tickets/${t3.id}`)
      .query({ projectId: project.id });
    expect(t3DetailsAfterAdd.status).toBe(200);
    expect(t3DetailsAfterAdd.body.dependencies).toEqual([
      expect.objectContaining({ id: t1.id, key: t1.key, title: t1.title }),
    ]);

    const t4DetailsAfterAdd = await ownerApi
      .get(`/api/v1/tickets/${t4.id}`)
      .query({ projectId: project.id });
    expect(t4DetailsAfterAdd.status).toBe(200);
    expect(t4DetailsAfterAdd.body.dependencies).toEqual([
      expect.objectContaining({ id: t1.id, key: t1.key, title: t1.title }),
    ]);

    // 4. Validation: A ticket cannot depend on itself.
    const selfDepResponse = await ownerApi
      .post(`/api/v1/tickets/${t1.id}/dependencies`)
      .set('x-project-id', project.id)
      .send({ dependencyId: t1.id });
    expect(selfDepResponse.status).toBe(400);
    expect(selfDepResponse.body.error).toContain('cannot depend on itself');

    // 5. Validation: A ticket cannot block itself.
    const selfBlockerResponse = await ownerApi
      .post(`/api/v1/tickets/${t1.id}/blockers`)
      .set('x-project-id', project.id)
      .send({ blockerId: t1.id });
    expect(selfBlockerResponse.status).toBe(400);
    expect(selfBlockerResponse.body.error).toContain('cannot block itself');

    // 6. Validation: Circular blocker detection (T1 already blocks T2, so T2 cannot block T1).
    const circularBlockerResponse = await ownerApi
      .post(`/api/v1/tickets/${t1.id}/blockers`)
      .set('x-project-id', project.id)
      .send({ blockerId: t2.id });
    expect(circularBlockerResponse.status).toBe(400);
    expect(circularBlockerResponse.body.error).toContain('already blocks the selected ticket');

    // 7. List dependencies and blockers explicitly via endpoint.
    const listDependenciesResponse = await ownerApi
      .get(`/api/v1/tickets/${t1.id}/dependencies`)
      .set('x-project-id', project.id);
    expect(listDependenciesResponse.status).toBe(200);
    expect(listDependenciesResponse.body).toEqual([
      expect.objectContaining({ id: t2.id, key: t2.key, title: t2.title }),
    ]);

    const listBlockersResponse = await ownerApi
      .get(`/api/v1/tickets/${t1.id}/blockers`)
      .set('x-project-id', project.id);
    expect(listBlockersResponse.status).toBe(200);
    expect(listBlockersResponse.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: t3.id, key: t3.key, title: t3.title }),
      expect.objectContaining({ id: t4.id, key: t4.key, title: t4.title }),
    ]));

    // 8. Remove a blocker and then remove the dependency.
    const deleteBlockerResponse = await ownerApi
      .delete(`/api/v1/tickets/${t1.id}/blockers/${t3.id}`)
      .set('x-project-id', project.id);
    expect(deleteBlockerResponse.status).toBe(200);
    expect(deleteBlockerResponse.body).toEqual({ success: true });

    const t1DetailsAfterBlockerDelete = await ownerApi
      .get(`/api/v1/tickets/${t1.id}`)
      .query({ projectId: project.id });
    expect(t1DetailsAfterBlockerDelete.body.blockers).toEqual([
      expect.objectContaining({ id: t4.id, key: t4.key, title: t4.title }),
    ]);

    const deleteDepResponse = await ownerApi
      .delete(`/api/v1/tickets/${t1.id}/dependencies/${t2.id}`)
      .set('x-project-id', project.id);
    expect(deleteDepResponse.status).toBe(200);
    expect(deleteDepResponse.body).toEqual({ success: true });

    // Verify T1 dependency list is empty again.
    const t1DetailsAfterDelete = await ownerApi
      .get(`/api/v1/tickets/${t1.id}`)
      .query({ projectId: project.id });
    expect(t1DetailsAfterDelete.body.dependencies).toEqual([]);

    // Verify T2 blocker list is empty again.
    const t2DetailsAfterDelete = await ownerApi
      .get(`/api/v1/tickets/${t2.id}`)
      .query({ projectId: project.id });
    expect(t2DetailsAfterDelete.body.blockers).toEqual([]);

    // Verify blocker removal clears the remaining blocker list for T1.
    const deleteRemainingBlockerResponse = await ownerApi
      .delete(`/api/v1/tickets/${t1.id}/blockers/${t4.id}`)
      .set('x-project-id', project.id);
    expect(deleteRemainingBlockerResponse.status).toBe(200);
    expect(deleteRemainingBlockerResponse.body).toEqual({ success: true });

    const t1DetailsAfterAllDeletes = await ownerApi
      .get(`/api/v1/tickets/${t1.id}`)
      .query({ projectId: project.id });
    expect(t1DetailsAfterAllDeletes.body.blockers).toEqual([]);

    // Ensure the inverse relation also cleared.
    const t4DetailsAfterDelete = await ownerApi
      .get(`/api/v1/tickets/${t4.id}`)
      .query({ projectId: project.id });
    expect(t4DetailsAfterDelete.body.dependencies).toEqual([]);
  });


  it('removes blocker and dependency relationships when a ticket transitions to done', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Katherine Johnson',
      email: 'katherine@example.com',
      role: 'owner',
    });

    const { workspace, project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const secondProjectResponse = await ownerApi.post('/api/v1/projects').send({
      name: 'Gravity API',
      key: 'API',
      ownerId: ownerApi.user.id,
      workspaceId: workspace.id,
    });
    expect(secondProjectResponse.status).toBe(201);
    const secondProjectId = String(secondProjectResponse.body.id);

    const completedTicket = await seedTicket(project.id, {
      id: 'ticket-done-cleanup-1',
      key: 'GRV-71',
      title: 'Completed ticket',
      priority: 'high',
    });

    const previouslyBlockedTicket = await seedTicket(project.id, {
      id: 'ticket-done-cleanup-2',
      key: 'GRV-72',
      title: 'Previously blocked ticket',
      priority: 'medium',
    });

    const crossProjectBlocker = await seedTicket(secondProjectId, {
      id: 'ticket-done-cleanup-3',
      key: 'API-1',
      title: 'Cross-project blocker',
      priority: 'medium',
    });

    const addDependencyResponse = await ownerApi
      .post(`/api/v1/tickets/${completedTicket.id}/dependencies`)
      .set('x-project-id', project.id)
      .send({ dependencyId: previouslyBlockedTicket.id });
    expect(addDependencyResponse.status).toBe(201);

    const addBlockerResponse = await ownerApi
      .post(`/api/v1/tickets/${completedTicket.id}/blockers`)
      .set('x-project-id', project.id)
      .send({ blockerId: crossProjectBlocker.id });
    expect(addBlockerResponse.status).toBe(201);

    const markDoneResponse = await ownerApi
      .patch(`/api/v1/tickets/${completedTicket.id}`)
      .set('x-project-id', project.id)
      .send({ status: 'done' });
    expect(markDoneResponse.status).toBe(200);
    expect(markDoneResponse.body).toMatchObject({
      id: completedTicket.id,
      status: 'done',
      isBlocked: false,
      isDependency: false,
    });

    const completedDetails = await ownerApi
      .get(`/api/v1/tickets/${completedTicket.id}`)
      .query({ projectId: project.id });
    expect(completedDetails.status).toBe(200);
    expect(completedDetails.body.dependencies).toEqual([]);
    expect(completedDetails.body.blockers).toEqual([]);
    expect(completedDetails.body.isBlocked).toBe(false);
    expect(completedDetails.body.isDependency).toBe(false);

    const previouslyBlockedDetails = await ownerApi
      .get(`/api/v1/tickets/${previouslyBlockedTicket.id}`)
      .query({ projectId: project.id });
    expect(previouslyBlockedDetails.status).toBe(200);
    expect(previouslyBlockedDetails.body.blockers).toEqual([]);
    expect(previouslyBlockedDetails.body.isBlocked).toBe(false);

    const crossProjectBlockerDetails = await ownerApi
      .get(`/api/v1/tickets/${crossProjectBlocker.id}`)
      .query({ projectId: secondProjectId });
    expect(crossProjectBlockerDetails.status).toBe(200);
    expect(crossProjectBlockerDetails.body.dependencies).toEqual([]);
    expect(crossProjectBlockerDetails.body.isDependency).toBe(false);

    const firstProjectTickets = await ownerApi.get('/api/v1/tickets').query({ projectId: project.id });
    expect(firstProjectTickets.status).toBe(200);
    expect(firstProjectTickets.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: completedTicket.id, isBlocked: false, isDependency: false }),
      expect.objectContaining({ id: previouslyBlockedTicket.id, isBlocked: false, isDependency: false }),
    ]));

    const secondProjectTickets = await ownerApi.get('/api/v1/tickets').query({ projectId: secondProjectId });
    expect(secondProjectTickets.status).toBe(200);
    expect(secondProjectTickets.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: crossProjectBlocker.id, isBlocked: false, isDependency: false }),
    ]));

    const remainingRelationships = await db.select().from(ticketRelationships);
    expect(remainingRelationships).toEqual([]);
  });

  it('clears stale relationships when a done ticket is saved as done again', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Dorothy Vaughan',
      email: 'dorothy@example.com',
      role: 'owner',
    });

    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const doneTicket = await seedTicket(project.id, {
      id: 'ticket-stale-done-1',
      key: 'GRV-80',
      title: 'Already done ticket',
      status: 'done',
      priority: 'medium',
    });

    const blockedTicket = await seedTicket(project.id, {
      id: 'ticket-stale-done-2',
      key: 'GRV-81',
      title: 'Blocked by stale done ticket',
      priority: 'medium',
    });

    const createRelationshipResponse = await ownerApi
      .post(`/api/v1/tickets/${doneTicket.id}/dependencies`)
      .set('x-project-id', project.id)
      .send({ dependencyId: blockedTicket.id });
    expect(createRelationshipResponse.status).toBe(201);

    const blockedDetailsBeforeRefresh = await ownerApi
      .get(`/api/v1/tickets/${blockedTicket.id}`)
      .query({ projectId: project.id });
    expect(blockedDetailsBeforeRefresh.status).toBe(200);
    expect(blockedDetailsBeforeRefresh.body.blockers).toEqual([]);

    const saveDoneAgainResponse = await ownerApi
      .patch(`/api/v1/tickets/${doneTicket.id}`)
      .set('x-project-id', project.id)
      .send({ status: 'done' });
    expect(saveDoneAgainResponse.status).toBe(200);

    const doneDetails = await ownerApi
      .get(`/api/v1/tickets/${doneTicket.id}`)
      .query({ projectId: project.id });
    expect(doneDetails.status).toBe(200);
    expect(doneDetails.body.dependencies).toEqual([]);
    expect(doneDetails.body.blockers).toEqual([]);

    const blockedDetailsAfterRefresh = await ownerApi
      .get(`/api/v1/tickets/${blockedTicket.id}`)
      .query({ projectId: project.id });
    expect(blockedDetailsAfterRefresh.status).toBe(200);
    expect(blockedDetailsAfterRefresh.body.blockers).toEqual([]);
    expect(blockedDetailsAfterRefresh.body.isBlocked).toBe(false);

    const remainingRelationships = await db.select().from(ticketRelationships);
    expect(remainingRelationships).toEqual([]);
  });


  it('prevents deep circular dependencies', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Grace Hopper',
      email: 'grace@example.com',
      role: 'owner',
    });
    
    const { project } = await seedWorkspaceFixture({
      owner: {
        id: ownerApi.user.id,
        name: ownerApi.user.name,
        email: ownerApi.user.email,
        role: 'owner',
        avatarUrl: ownerApi.user.avatar,
      },
    });

    const ta = await seedTicket(project.id, { id: 'ta', key: 'GRAV-A', title: 'A', priority: 'medium' });
    const tb = await seedTicket(project.id, { id: 'tb', key: 'GRAV-B', title: 'B', priority: 'medium' });
    const tc = await seedTicket(project.id, { id: 'tc', key: 'GRAV-C', title: 'C', priority: 'medium' });

    // A blocks B (B depends on A)
    await ownerApi.post(`/api/v1/tickets/${ta.id}/dependencies`).send({ dependencyId: tb.id });
    // B blocks C (C depends on B)
    await ownerApi.post(`/api/v1/tickets/${tb.id}/dependencies`).send({ dependencyId: tc.id });

    // C tries to block A (A depends on C) -> cycle A->B->C->A
    const circularResponse = await ownerApi.post(`/api/v1/tickets/${tc.id}/dependencies`).send({ dependencyId: ta.id });
    expect(circularResponse.status).toBe(400);
    expect(circularResponse.body.error).toContain('Circular dependency detected');
  });

});
