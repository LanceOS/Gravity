import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import * as cache from './cache.js';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  projects,
  projectMembers,
  userProfiles,
  userSettings,
  workspaceJoinRequests,
  workspaceMembers,
  workspaces,
  workspaceSettings,
} from '../db/schema.js';
import { env } from '../env.js';
import { getWorkspaceMemberRole } from '../modules/workspaces/services/membership.js';

export type ClientUser = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  tutorial_completed: number;
};

type RawUserRow = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string | null;
  tutorial_completed: boolean | null;
};

type RawSettingsRow = {
  userId: string;
  tutorialCompleted: boolean;
  theme: string;
  defaultView: string;
  ollamaEndpoint: string;
  preferredOllamaModel: string | null;
  aiProvider: string;
  agentIntegration: string;
  projectLayout: string;
  encryptedApiKey: string | null;
};

export function createId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export function normalizeEntityKey(value: string) {
  return value.trim().toUpperCase();
}

export function createWorkspaceAccessKey(workspaceKey: string) {
  return `WS-${normalizeEntityKey(workspaceKey)}-${Math.floor(100000 + Math.random() * 900000)}`;
}

export function createProjectInviteCode(projectKey: string) {
  return `INV-${normalizeEntityKey(projectKey)}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function createWorkspaceInviteCode(workspaceKey: string) {
  return `WSP-${normalizeEntityKey(workspaceKey)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function normalizeIsoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }

  return new Date().toISOString();
}

export function getProjectIdFromRequest(req: Request) {
  const fromHeader = req.header('x-project-id');
  const fromQuery = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const fromBody = typeof req.body?.projectId === 'string' ? req.body.projectId : undefined;
  return fromHeader || fromQuery || fromBody || '';
}

export function normalizeOllamaUrl(url: string) {
  return url.replace(/\/$/, '');
}

export async function ensureUserDefaults(userId: string) {
  await db
    .insert(userProfiles)
    .values({
      userId,
      role: 'guest_contributor',
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userId)}`,
    })
    .onConflictDoNothing({ target: userProfiles.userId });

  await db
    .insert(userSettings)
    .values({
      userId,
      theme: 'dark',
      defaultView: 'board',
      ollamaEndpoint: env.ollamaDefaultEndpoint,
      aiProvider: 'openai',
      agentIntegration: 'ollama',
      projectLayout: 'standard',
      tutorialCompleted: false,
    })
    .onConflictDoNothing({ target: userSettings.userId });
}

export function toClientUser(row: RawUserRow): ClientUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar ?? '',
    role: row.role ?? 'guest_contributor',
    tutorial_completed: row.tutorial_completed ? 1 : 0,
  };
}

export async function getUserById(userId: string) {
  await ensureUserDefaults(userId);

  const result = await db.execute(sql`
    SELECT
      u.id,
      u.name,
      u.email,
      COALESCE(up.avatar_url, u.image, '') AS avatar,
      COALESCE(up.role, 'guest_contributor') AS role,
      COALESCE(us.tutorial_completed, FALSE) AS tutorial_completed
    FROM "user" u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    LEFT JOIN user_settings us ON us.user_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `);

  const row = (result.rows as RawUserRow[])[0];
  return row ? toClientUser(row) : null;
}

export async function listUsers(projectId?: string) {
  const result = projectId
    ? await db.execute(sql`
        SELECT DISTINCT
          u.id,
          u.name,
          u.email,
          COALESCE(up.avatar_url, u.image, '') AS avatar,
          COALESCE(up.role, 'guest_contributor') AS role,
          COALESCE(us.tutorial_completed, FALSE) AS tutorial_completed
        FROM project_members pm
        JOIN "user" u ON u.id = pm.user_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN user_settings us ON us.user_id = u.id
        WHERE pm.project_id = ${projectId}
        ORDER BY u.name ASC
      `)
    : await db.execute(sql`
        SELECT
          u.id,
          u.name,
          u.email,
          COALESCE(up.avatar_url, u.image, '') AS avatar,
          COALESCE(up.role, 'guest_contributor') AS role,
          COALESCE(us.tutorial_completed, FALSE) AS tutorial_completed
        FROM "user" u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN user_settings us ON us.user_id = u.id
        ORDER BY u.name ASC
      `);

  return (result.rows as RawUserRow[]).map(toClientUser);
}

export async function getUserSettingsRecord(userId: string): Promise<RawSettingsRow> {
  await ensureUserDefaults(userId);

  const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const row = settings[0];

  return {
    userId,
    tutorialCompleted: row?.tutorialCompleted ?? false,
    theme: row?.theme ?? 'dark',
    defaultView: row?.defaultView ?? 'board',
    ollamaEndpoint: row?.ollamaEndpoint ?? env.ollamaDefaultEndpoint,
    preferredOllamaModel: row?.preferredOllamaModel ?? null,
    aiProvider: row?.aiProvider ?? 'openai',
    agentIntegration: row?.agentIntegration ?? 'ollama',
    projectLayout: row?.projectLayout ?? 'standard',
    encryptedApiKey: row?.encryptedApiKey ?? null,
  };
}

export async function addUserToWorkspaceProjects(
  workspaceId: string,
  userId: string,
  role = 'developer',
  provisionedByValidationId?: string,
  tx: any = db
) {
  await tx.execute(sql`
    INSERT INTO project_members (project_id, user_id, role, provisioned_by_validation_id, created_at)
    SELECT p.id, ${userId}, ${role}, ${provisionedByValidationId ?? null}, NOW()
    FROM projects p
    WHERE p.workspace_id = ${workspaceId}
    ON CONFLICT (project_id, user_id) DO NOTHING
  `);
}

export async function addWorkspaceMembersToProject(workspaceId: string, projectId: string, tx: any = db) {
  await tx.execute(sql`
    INSERT INTO project_members (project_id, user_id, role, provisioned_by_validation_id, created_at)
    SELECT ${projectId}, wm.user_id, CASE WHEN wm.role = 'owner' THEN 'owner' ELSE 'developer' END, wm.provisioned_by_validation_id, NOW()
    FROM workspace_members wm
    WHERE wm.workspace_id = ${workspaceId}
    ON CONFLICT (project_id, user_id) DO NOTHING
  `);
}

export type CountRow = {
  workspaceId: string;
  count: number;
};

export type WorkspaceRow = {
  id: string;
  name: string;
  description: string | null;
  key: string;
  defaultProjectId: string | null;
  workspaceHostUrl: string | null;
  settingsHostUrl: string | null;
  joinMode: string | null;
  hierarchyMode: 'flat' | 'teams' | null;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  description: string;
  key: string;
  defaultProjectId: string | null;
  hostUrl: string;
  joinMode: 'auto_join' | 'approval_required';
  projectCount: number;
  memberCount: number;
  pendingJoinRequestCount: number;
  memberRole?: string;
  hierarchyMode?: 'flat' | 'teams';
};

type WorkspaceSummaryBase = Omit<WorkspaceSummary, 'memberRole'>;

export async function listWorkspaceSummaries(userId?: string): Promise<WorkspaceSummary[]> {
  const cacheKey = userId ? cache.CacheKeys.workspaces.byUser(userId) : cache.CacheKeys.workspaces.all();
  return cache.wrap(cacheKey, 300, async () => {
    const memberRoleByWorkspace = new Map<string, string>();
    let accessibleWorkspaceIds: string[] | null = null;

    if (userId) {
      const membershipRows = await db
        .select({
          workspaceId: workspaceMembers.workspaceId,
          role: workspaceMembers.role,
        })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, userId));

      for (const membership of membershipRows) {
        memberRoleByWorkspace.set(membership.workspaceId, membership.role);
      }

      accessibleWorkspaceIds = membershipRows.map((membership) => membership.workspaceId);
      if (!accessibleWorkspaceIds || accessibleWorkspaceIds.length === 0) {
        return [];
      }
    }

    const workspaceQuery = db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        description: workspaces.description,
        key: workspaces.key,
        defaultProjectId: workspaces.defaultProjectId,
        workspaceHostUrl: workspaces.hostUrl,
        settingsHostUrl: workspaceSettings.hostUrl,
        joinMode: workspaceSettings.joinMode,
        hierarchyMode: workspaceSettings.hierarchyMode,
      })
      .from(workspaces)
      .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, workspaces.id));

    const workspaceRows: WorkspaceRow[] = accessibleWorkspaceIds
      ? await workspaceQuery.where(inArray(workspaces.id, accessibleWorkspaceIds)).orderBy(asc(workspaces.createdAt))
      : await workspaceQuery.orderBy(asc(workspaces.createdAt));
    if (workspaceRows.length === 0) {
      return [];
    }

    const workspaceIds = workspaceRows.map((workspace) => workspace.id);

    const [projectCountRows, memberCountRows, pendingJoinRequestCountRows] = await Promise.all([
      db
        .select({
          workspaceId: projects.workspaceId,
          count: sql<number>`count(*)`,
        })
        .from(projects)
        .where(inArray(projects.workspaceId, workspaceIds))
        .groupBy(projects.workspaceId),
      db
        .select({
          workspaceId: workspaceMembers.workspaceId,
          count: sql<number>`count(*)`,
        })
        .from(workspaceMembers)
        .where(inArray(workspaceMembers.workspaceId, workspaceIds))
        .groupBy(workspaceMembers.workspaceId),
      db
        .select({
          workspaceId: workspaceJoinRequests.workspaceId,
          count: sql<number>`count(*)`,
        })
        .from(workspaceJoinRequests)
        .where(and(inArray(workspaceJoinRequests.workspaceId, workspaceIds), eq(workspaceJoinRequests.status, 'pending')))
        .groupBy(workspaceJoinRequests.workspaceId),
    ]);

    const projectCountByWorkspace: Map<string, number> = new Map(projectCountRows.map((row) => [row.workspaceId, Number(row.count ?? 0)]));
    const memberCountByWorkspace: Map<string, number> = new Map(memberCountRows.map((row) => [row.workspaceId, Number(row.count ?? 0)]));
    const pendingJoinRequestCountByWorkspace: Map<string, number> = new Map(
      pendingJoinRequestCountRows.map((row) => [row.workspaceId, Number(row.count ?? 0)]),
    );

    return workspaceRows.map((workspace): WorkspaceSummary => ({
      id: workspace.id,
      name: workspace.name,
      description: workspace.description ?? '',
      key: workspace.key,
      defaultProjectId: workspace.defaultProjectId ?? null,
      hostUrl: workspace.settingsHostUrl || workspace.workspaceHostUrl || '',
      joinMode: workspace.joinMode === 'auto_join' ? 'auto_join' : 'approval_required',
      projectCount: projectCountByWorkspace.get(workspace.id) ?? 0,
      memberCount: memberCountByWorkspace.get(workspace.id) ?? 0,
      pendingJoinRequestCount: pendingJoinRequestCountByWorkspace.get(workspace.id) ?? 0,
      hierarchyMode: workspace.hierarchyMode ?? 'flat',
      ...(memberRoleByWorkspace.has(workspace.id) ? { memberRole: memberRoleByWorkspace.get(workspace.id) } : {}),
    }));
  });
}

export async function invalidateWorkspaceCache(workspaceId: string): Promise<void> {
  try {
    const keysToInvalidate = [cache.CacheKeys.workspaces.all(), cache.CacheKeys.workspaces.byId(workspaceId)];
    const members = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));

    for (const member of members) {
      keysToInvalidate.push(cache.CacheKeys.workspaces.byUser(member.userId));
    }
    await cache.delMany(keysToInvalidate);
  } catch (error) {
    console.error(`Failed to invalidate cache for workspace ${workspaceId}:`, error);
  }
}

export async function invalidateUserWorkspacesCache(userId: string): Promise<void> {
  try {
    await cache.delMany([
      cache.CacheKeys.workspaces.all(),
      cache.CacheKeys.workspaces.byUser(userId),
    ]);
  } catch (error) {
    console.error(`Failed to invalidate cache for user ${userId}:`, error);
  }
}

export async function getWorkspaceSummary(workspaceId: string, userId?: string) {
  const cacheKey = cache.CacheKeys.workspaces.byId(workspaceId);
  const summary = await cache.wrap(cacheKey, 300, async () => {
    const workspaceRows: WorkspaceSummaryBase[] = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        description: workspaces.description,
        key: workspaces.key,
        defaultProjectId: workspaces.defaultProjectId,
        workspaceHostUrl: workspaces.hostUrl,
        settingsHostUrl: workspaceSettings.hostUrl,
        joinMode: workspaceSettings.joinMode,
        hierarchyMode: workspaceSettings.hierarchyMode,
      })
      .from(workspaces)
      .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, workspaces.id))
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const workspace = workspaceRows[0];
    if (!workspace) {
      return null;
    }

    const [projectCountRow, memberCountRow, pendingJoinRequestCountRow] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(projects)
        .where(eq(projects.workspaceId, workspace.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspace.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(workspaceJoinRequests)
        .where(and(eq(workspaceJoinRequests.workspaceId, workspace.id), eq(workspaceJoinRequests.status, 'pending'))),
    ]);

    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description ?? '',
      key: workspace.key,
      defaultProjectId: workspace.defaultProjectId ?? null,
      hostUrl: workspace.settingsHostUrl || workspace.workspaceHostUrl || '',
      joinMode: workspace.joinMode === 'auto_join' ? 'auto_join' : 'approval_required',
      projectCount: Number(projectCountRow[0]?.count ?? 0),
      memberCount: Number(memberCountRow[0]?.count ?? 0),
      pendingJoinRequestCount: Number(pendingJoinRequestCountRow[0]?.count ?? 0),
      hierarchyMode: workspace.hierarchyMode ?? 'flat',
    };
  });

  if (!summary) {
    return null;
  }

  if (!userId) {
    return summary;
  }

  const memberRole = await getWorkspaceMemberRole(workspaceId, userId);
  if (!memberRole) {
    return null;
  }

  return { ...summary, memberRole };
}

export async function nextTicketKey(projectId: string) {
  const projectRows = await db.select({ key: projects.key }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = projectRows[0];

  if (!project) {
    throw new Error('Project not found.');
  }

  const existing = await db.execute(sql`
    SELECT key
    FROM tickets
    WHERE project_id = ${projectId}
      AND key LIKE ${`${normalizeEntityKey(project.key)}-%`}
  `);

  const maxValue = (existing.rows as Array<{ key: string }>).reduce((highest, row) => {
    const numeric = Number(row.key.split('-').pop() ?? 0);
    return Number.isFinite(numeric) && numeric > highest ? numeric : highest;
  }, 0);

  return `${normalizeEntityKey(project.key)}-${maxValue + 1}`;
}

export async function getProjectByKeyPrefix(prefix: string) {
  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.key, normalizeEntityKey(prefix)))
    .limit(1);

  return projectRows[0] ?? null;
}

export async function ensureWorkspaceSettingsRecord(workspaceId: string) {
  await db
    .insert(workspaceSettings)
    .values({ workspaceId, hostUrl: '', joinMode: 'approval_required', hierarchyMode: 'flat' })
    .onConflictDoNothing({ target: workspaceSettings.workspaceId });
}

export async function ensureWorkspaceMembership(
  workspaceId: string,
  userId: string,
  role = 'member',
  provisionedByValidationId?: string,
  tx: any = db
) {
  await tx
    .insert(workspaceMembers)
    .values({ workspaceId, userId, role, provisionedByValidationId: provisionedByValidationId ?? null })
    .onConflictDoNothing({ target: [workspaceMembers.workspaceId, workspaceMembers.userId] });
}

export async function ensureProjectMembership(
  projectId: string,
  userId: string,
  role = 'developer',
  provisionedByValidationId?: string,
  tx: any = db
) {
  await tx
    .insert(projectMembers)
    .values({ projectId, userId, role, provisionedByValidationId: provisionedByValidationId ?? null })
    .onConflictDoNothing({ target: [projectMembers.projectId, projectMembers.userId] });
}
