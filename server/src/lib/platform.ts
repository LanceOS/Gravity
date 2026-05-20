import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  projects,
  projectMembers,
  userProfiles,
  userSettings,
  workspaceMembers,
  workspaceSettings,
} from '../db/schema.js';
import { env } from '../env.js';

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
  return `INV-${normalizeEntityKey(projectKey)}-${Math.floor(1000 + Math.random() * 9000)}`;
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
    .values({ userId, role: 'guest_contributor' })
    .onConflictDoNothing({ target: userProfiles.userId });

  await db
    .insert(userSettings)
    .values({
      userId,
      theme: 'dark',
      defaultView: 'board',
      ollamaEndpoint: env.ollamaDefaultEndpoint,
      aiProvider: 'openai',
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
    projectLayout: row?.projectLayout ?? 'standard',
    encryptedApiKey: row?.encryptedApiKey ?? null,
  };
}

export async function addUserToWorkspaceProjects(
  workspaceId: string,
  userId: string,
  role = 'developer',
  provisionedByValidationId?: string,
) {
  await db.execute(sql`
    INSERT INTO project_members (project_id, user_id, role, provisioned_by_validation_id, created_at)
    SELECT p.id, ${userId}, ${role}, ${provisionedByValidationId ?? null}, NOW()
    FROM projects p
    WHERE p.workspace_id = ${workspaceId}
    ON CONFLICT (project_id, user_id) DO NOTHING
  `);
}

export async function addWorkspaceMembersToProject(workspaceId: string, projectId: string) {
  await db.execute(sql`
    INSERT INTO project_members (project_id, user_id, role, provisioned_by_validation_id, created_at)
    SELECT ${projectId}, wm.user_id, CASE WHEN wm.role = 'owner' THEN 'owner' ELSE 'developer' END, wm.provisioned_by_validation_id, NOW()
    FROM workspace_members wm
    WHERE wm.workspace_id = ${workspaceId}
    ON CONFLICT (project_id, user_id) DO NOTHING
  `);
}

export async function listWorkspaceSummaries(userId?: string) {
  const memberSelect = userId ? sql`, wm.role AS member_role` : sql``;
  const memberJoin = userId
    ? sql`LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ${userId}`
    : sql``;
  const filter = userId
    ? sql`WHERE EXISTS (
        SELECT 1 FROM workspace_members wm2 WHERE wm2.workspace_id = w.id AND wm2.user_id = ${userId}
      )`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      w.id,
      w.name,
      w.description,
      w.key,
      w.default_project_id,
      COALESCE(ws.host_url, w.host_url, '') AS host_url,
      COALESCE(ws.join_mode, 'approval_required') AS join_mode,
      (SELECT COUNT(*) FROM projects p WHERE p.workspace_id = w.id) AS project_count,
      (SELECT COUNT(*) FROM workspace_members members WHERE members.workspace_id = w.id) AS member_count,
      (
        SELECT COUNT(*)
        FROM workspace_join_requests requests
        WHERE requests.workspace_id = w.id AND requests.status = 'pending'
      ) AS pending_join_request_count
      ${memberSelect}
    FROM workspaces w
    LEFT JOIN workspace_settings ws ON ws.workspace_id = w.id
    ${memberJoin}
    ${filter}
    ORDER BY w.created_at ASC
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    key: String(row.key),
    defaultProjectId: row.default_project_id ? String(row.default_project_id) : null,
    hostUrl: String(row.host_url ?? ''),
    joinMode: row.join_mode === 'auto_join' ? 'auto_join' : 'approval_required',
    projectCount: Number(row.project_count ?? 0),
    memberCount: Number(row.member_count ?? 0),
    pendingJoinRequestCount: Number(row.pending_join_request_count ?? 0),
    ...(row.member_role ? { memberRole: String(row.member_role) } : {}),
  }));
}

export async function getWorkspaceSummary(workspaceId: string, userId?: string) {
  const summaries = await listWorkspaceSummaries(userId);
  return summaries.find((workspace) => workspace.id === workspaceId) ?? null;
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
    .values({ workspaceId, hostUrl: '', joinMode: 'approval_required' })
    .onConflictDoNothing({ target: workspaceSettings.workspaceId });
}

export async function ensureWorkspaceMembership(
  workspaceId: string,
  userId: string,
  role = 'member',
  provisionedByValidationId?: string,
) {
  await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId, role, provisionedByValidationId: provisionedByValidationId ?? null })
    .onConflictDoNothing({ target: [workspaceMembers.workspaceId, workspaceMembers.userId] });
}

export async function ensureProjectMembership(
  projectId: string,
  userId: string,
  role = 'developer',
  provisionedByValidationId?: string,
) {
  await db
    .insert(projectMembers)
    .values({ projectId, userId, role, provisionedByValidationId: provisionedByValidationId ?? null })
    .onConflictDoNothing({ target: [projectMembers.projectId, projectMembers.userId] });
}