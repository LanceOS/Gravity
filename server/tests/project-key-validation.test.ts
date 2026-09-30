import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { projects, tickets, workspaces } from '../src/db/schema.js';
import { createProjectRecord, updateProjectRecord } from '../src/modules/workspaces/services/projects.js';
import { InvalidProjectKeyError, normalizeProjectKey } from '../src/modules/workspaces/utils/project-key.js';
import { createAuthenticatedApi, seedTicket, seedWorkspaceFixture } from './helpers/test-helpers.js';

const invalidKeys: unknown[] = [
  '', '   ', '\u00a0', undefined, null, 0, 123, true, {}, ['ABC'],
  '\tABC', 'ABC\n', 'A\rB', 'A\u0000B', 'A\u001bB', 'A\u007fB', '\u0085ABC',
  'A B', 'A-B', 'A_B', 'A/B', 'café', 'ß',
];

describe('new project key validation', () => {
  it('rejects all C0/C1 controls before trimming and does not coerce non-string service inputs', async () => {
    const controls = Array.from({ length: 160 }, (_, code) => code)
      .filter(code => code <= 31 || code >= 127);
    for (const code of controls) {
      const control = String.fromCharCode(code);
      for (const key of [`${control}ABC`, `A${control}BC`, `ABC${control}`]) {
        expect(() => normalizeProjectKey(key), `control U+${code.toString(16)}`).toThrow(InvalidProjectKeyError);
      }
    }
    for (const key of [Symbol('ABC'), 123n, new String('ABC'), { toString: () => 'ABC' }]) {
      await expect(createProjectRecord({ name: 'Invalid prefix', key, ownerId: 'unused' }))
        .rejects.toBeInstanceOf(InvalidProjectKeyError);
    }
    expect(() => normalizeProjectKey(`${'A'.repeat(8192)}!`)).toThrow(InvalidProjectKeyError);
    expect(normalizeProjectKey('\u00a0 a0 \u2003')).toBe('A0');
    expect(normalizeProjectKey('0')).toBe('0');
  });

  it('rejects malformed REST keys with actionable 400 errors and no writes', async () => {
    const ownerApi = await createAuthenticatedApi();
    const { workspace } = await seedWorkspaceFixture({ owner: { id: ownerApi.user.id } });
    const beforeProjects = await db.select().from(projects);
    const beforeWorkspaces = await db.select().from(workspaces);

    for (const workspaceId of [undefined, workspace.id]) {
      for (const key of invalidKeys) {
        const response = await ownerApi.post('/api/v1/projects').send({
          name: 'Invalid prefix', key, workspaceId,
        });
        expect(response.status, JSON.stringify(key)).toBe(400);
        expect(response.body.error).toMatch(/Project key must be a nonempty string.*letters.*digits.*control characters/);
      }
    }
    expect(await db.select().from(projects)).toEqual(beforeProjects);
    expect(await db.select().from(workspaces)).toEqual(beforeWorkspaces);
  });

  it('enforces validation directly at the service boundary before either workspace path writes', async () => {
    const { owner, workspace } = await seedWorkspaceFixture();
    const beforeProjects = await db.select().from(projects);
    const beforeWorkspaces = await db.select().from(workspaces);
    for (const workspaceId of [undefined, workspace.id]) {
      for (const key of invalidKeys) {
        await expect(createProjectRecord({
          name: 'Invalid prefix', key, ownerId: owner.id, workspaceId,
        })).rejects.toBeInstanceOf(InvalidProjectKeyError);
      }
    }
    expect(await db.select().from(projects)).toEqual(beforeProjects);
    expect(await db.select().from(workspaces)).toEqual(beforeWorkspaces);
  });

  it('persists valid normalized REST prefixes and checks normalized duplicates', async () => {
    const ownerApi = await createAuthenticatedApi();
    for (const [key, normalized] of [[' abc123 ', 'ABC123'], [' 123 ', '123']]) {
      const response = await ownerApi.post('/api/v1/projects').send({ name: 'Valid prefix', key });
      expect(response.status).toBe(201);
      expect(response.body.key).toBe(normalized);
      const [stored] = await db.select().from(projects).where(eq(projects.id, response.body.id));
      expect(stored.key).toBe(normalized);

      const inWorkspace = await ownerApi.post('/api/v1/projects').send({
        name: 'Existing workspace prefix', key: ` ${normalized.toLowerCase()}x `, workspaceId: stored.workspaceId,
      });
      expect(inWorkspace.status).toBe(201);
      expect(inWorkspace.body).toMatchObject({ key: `${normalized}X`, workspaceId: stored.workspaceId });
      const [storedInWorkspace] = await db.select().from(projects).where(eq(projects.id, inWorkspace.body.id));
      expect(storedInWorkspace.key).toBe(`${normalized}X`);

      const duplicate = await ownerApi.post('/api/v1/projects').send({
        name: 'Duplicate prefix', key, workspaceId: stored.workspaceId,
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error).toContain(normalized);
    }
  });

  it('normalizes direct service creation in existing and implicit workspaces', async () => {
    const { owner, workspace } = await seedWorkspaceFixture();
    for (const workspaceId of [undefined, workspace.id]) {
      const project = await createProjectRecord({
        name: 'Valid prefix', key: ' a1b2 ', ownerId: owner.id, workspaceId,
      });
      expect(project.key).toBe('A1B2');
      if (workspaceId) expect(project.workspaceId).toBe(workspaceId);
    }
  });

  it('leaves historical project and ticket identities intact during unrelated updates', async () => {
    const { project } = await seedWorkspaceFixture({ project: { key: '' } });
    const ticket = await seedTicket(project.id, { key: '-1' });
    const updated = await updateProjectRecord(project.id, { name: 'Renamed project' });
    expect(updated?.key).toBe('');
    const [stored] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(stored.key).toBe('-1');
  });
});
