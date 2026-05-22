import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { db, pool } from '../../src/db/index.js';
import {
  authUsers,
  cycles,
  domains,
  projectMembers,
  projects,
  tickets,
  userProfiles,
  validations,
  workspaceInvites,
  workspaceMembers,
  workspaces,
  workspaceSettings,
} from '../../src/db/schema.js';
import { ensureUserDefaults } from '../../src/lib/platform.js';

type UserSeed = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
};

type WorkspaceFixtureSeed = {
  owner?: Partial<UserSeed>;
  workspace?: Partial<{
    id: string;
    name: string;
    description: string;
    key: string;
    workspaceKey: string;
    hostUrl: string;
    joinMode: 'approval_required' | 'auto_join';
  }>;
  project?: Partial<{
    id: string;
    name: string;
    description: string;
    key: string;
    status: string;
    inviteCode: string;
  }>;
};

type ValidationSeed = {
  id?: string;
  workspaceId: string;
  guestUserId: string;
  email: string;
  workspacePrivateKey?: string;
  inviteUrl?: string;
  validationCode?: string;
  isUsed?: boolean;
  issuedByUserId?: string | null;
};

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function api() {
  return request(createApp());
}

export async function resetDatabase() {
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `);

  const tables = result.rows
    .map((row) => (row && typeof row === 'object' && 'table_name' in row ? String((row as { table_name: unknown }).table_name) : ''))
    .filter(Boolean);

  if (tables.length === 0) {
    return;
  }

  for (const table of tables) {
    await pool.query(`TRUNCATE TABLE ${quoteIdentifier(table)} RESTART IDENTITY CASCADE`);
  }
}

export async function seedUser(overrides: Partial<UserSeed> = {}) {
  const user = {
    id: overrides.id ?? 'user-1',
    name: overrides.name ?? 'Ada Lovelace',
    email: overrides.email ?? 'ada@example.com',
    role: overrides.role ?? 'guest_contributor',
    avatarUrl: overrides.avatarUrl ?? 'https://example.com/avatar.png',
  } satisfies UserSeed;

  await db.insert(authUsers).values({
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: true,
    image: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await ensureUserDefaults(user.id);
  await db
    .update(userProfiles)
    .set({
      role: user.role,
      avatarUrl: user.avatarUrl,
    })
    .where(eq(userProfiles.userId, user.id));

  return user;
}

export async function seedWorkspaceFixture(seed: WorkspaceFixtureSeed = {}) {
  const owner = await seedUser({
    id: seed.owner?.id ?? 'owner-1',
    name: seed.owner?.name ?? 'Grace Hopper',
    email: seed.owner?.email ?? 'grace@example.com',
    role: seed.owner?.role ?? 'owner',
    avatarUrl: seed.owner?.avatarUrl ?? 'https://example.com/grace.png',
  });

  const workspace = {
    id: seed.workspace?.id ?? 'workspace-1',
    name: seed.workspace?.name ?? 'Gravity Workspace',
    description: seed.workspace?.description ?? 'Local integration workspace',
    key: seed.workspace?.key ?? 'GRV',
    workspaceKey: seed.workspace?.workspaceKey ?? 'WS-GRV-123456',
    hostUrl: seed.workspace?.hostUrl ?? '',
    joinMode: seed.workspace?.joinMode ?? 'approval_required',
  };

  const project = {
    id: seed.project?.id ?? 'project-1',
    name: seed.project?.name ?? 'Gravity App',
    description: seed.project?.description ?? 'Primary delivery project',
    key: seed.project?.key ?? 'GRV',
    status: seed.project?.status ?? 'active',
    inviteCode: seed.project?.inviteCode ?? 'INV-GRV-0001ABCD',
  };

  await db.insert(workspaces).values({
    id: workspace.id,
    name: workspace.name,
    description: workspace.description,
    key: workspace.key,
    workspaceKey: workspace.workspaceKey,
    hostUrl: workspace.hostUrl,
    createdBy: owner.id,
    createdAt: new Date(),
  });

  await db.insert(workspaceSettings).values({
    workspaceId: workspace.id,
    hostUrl: workspace.hostUrl,
    joinMode: workspace.joinMode,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: owner.id,
    role: owner.role,
    provisionedByValidationId: null,
    createdAt: new Date(),
  });

  await db.insert(projects).values({
    id: project.id,
    workspaceId: workspace.id,
    name: project.name,
    description: project.description,
    key: project.key,
    status: project.status,
    inviteCode: project.inviteCode,
    createdBy: owner.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db
    .update(workspaces)
    .set({ defaultProjectId: project.id })
    .where(eq(workspaces.id, workspace.id));

  await db.insert(projectMembers).values({
    projectId: project.id,
    userId: owner.id,
    role: owner.role,
    provisionedByValidationId: null,
    createdAt: new Date(),
  });

  return { owner, workspace, project };
}

export async function seedDomain(projectId: string, overrides: Partial<{ id: string; name: string; color: string }> = {}) {
  const domain = {
    id: overrides.id ?? 'domain-1',
    name: overrides.name ?? 'Platform',
    color: overrides.color ?? '#1D4ED8',
  };

  await db.insert(domains).values({
    id: domain.id,
    projectId,
    name: domain.name,
    color: domain.color,
    createdAt: new Date(),
  });

  return domain;
}

export async function seedCycle(
  projectId: string,
  overrides: Partial<{ id: string; name: string; startDate: Date; endDate: Date; completed: boolean }> = {},
) {
  const cycle = {
    id: overrides.id ?? 'cycle-1',
    name: overrides.name ?? 'Sprint 1',
    startDate: overrides.startDate ?? new Date('2025-01-01T00:00:00.000Z'),
    endDate: overrides.endDate ?? new Date('2025-01-08T00:00:00.000Z'),
    completed: overrides.completed ?? false,
  };

  await db.insert(cycles).values({
    id: cycle.id,
    projectId,
    name: cycle.name,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    completed: cycle.completed,
    createdAt: new Date(),
  });

  return cycle;
}

export async function seedTicket(
  projectId: string,
  overrides: Partial<{
    id: string;
    key: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    assigneeId: string | null;
    domainId: string | null;
    cycleId: string | null;
    parentId: string | null;
    prStatus: string;
    prUrl: string | null;
  }> = {},
) {
  const projectRows = await db.select({ key: projects.key }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = projectRows[0];

  const ticket = {
    id: overrides.id ?? 'ticket-1',
    key: overrides.key ?? `${project?.key ?? 'PRJ'}-1`,
    title: overrides.title ?? 'Wire route coverage',
    description: overrides.description ?? 'Exercise the server routes through pg-mem.',
    status: overrides.status ?? 'todo',
    priority: overrides.priority ?? 'medium',
    assigneeId: overrides.assigneeId ?? null,
    domainId: overrides.domainId ?? null,
    cycleId: overrides.cycleId ?? null,
    parentId: overrides.parentId ?? null,
    prStatus: overrides.prStatus ?? 'none',
    prUrl: overrides.prUrl ?? null,
  };

  await db.insert(tickets).values({
    id: ticket.id,
    key: ticket.key,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    assigneeId: ticket.assigneeId,
    projectId,
    domainId: ticket.domainId,
    cycleId: ticket.cycleId,
    parentId: ticket.parentId,
    prStatus: ticket.prStatus,
    prUrl: ticket.prUrl,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return ticket;
}

export async function seedWorkspaceInvite(
  workspaceId: string,
  createdBy: string,
  overrides: Partial<{ id: string; code: string; label: string; maxUses: number | null; useCount: number }> = {},
) {
  const invite = {
    id: overrides.id ?? 'workspace-invite-1',
    code: overrides.code ?? 'WSP-GRV-1001',
    label: overrides.label ?? 'Team Invite',
    maxUses: overrides.maxUses ?? null,
    useCount: overrides.useCount ?? 0,
  };

  await db.insert(workspaceInvites).values({
    id: invite.id,
    workspaceId,
    code: invite.code,
    createdBy,
    label: invite.label,
    expiresAt: null,
    revokedAt: null,
    maxUses: invite.maxUses,
    useCount: invite.useCount,
    createdAt: new Date(),
  });

  return invite;
}

export async function seedValidationAccess(seed: ValidationSeed) {
  const validation = {
    id: seed.id ?? 'validation-1',
    workspaceId: seed.workspaceId,
    issuedByUserId: seed.issuedByUserId ?? null,
    email: seed.email,
    inviteUrl: seed.inviteUrl ?? 'http://localhost:8080/api/v1/workspaces/validate',
    validationCode: seed.validationCode ?? 'GRAV-1001-A',
    workspacePrivateKey: seed.workspacePrivateKey ?? 'sec_wsp_fixture',
    guestUserId: seed.guestUserId,
    guestUsername: 'guest-user',
    guestPasswordHash: 'hash-123',
    isUsed: seed.isUsed ?? true,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: new Date(),
    revokedAt: null,
    createdAt: new Date(),
  };

  await db.insert(validations).values(validation);
  return validation;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

export async function readSseChunk(path: string) {
  const server = createApp().listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server.');
    }

    return await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; chunk: string }>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          method: 'GET',
          path,
          port: (address as AddressInfo).port,
        },
        (res) => {
          res.setEncoding('utf8');
          res.once('data', (chunk) => {
            resolve({
              statusCode: res.statusCode ?? 0,
              headers: res.headers,
              chunk,
            });
            res.destroy();
          });
          res.once('error', reject);
        },
      );

      req.once('error', reject);
      req.end();
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}