import { describe, expect, it } from 'vitest';
import {
  createAuthenticatedApi,
  seedTicket,
  seedWorkspaceFixture,
} from './helpers/test-helpers.js';

describe('ticket relationship routes', () => {
  it('manages ticket dependencies and blockers and enforces validation rules', async () => {
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
});
