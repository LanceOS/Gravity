import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  authUsers,
  projects,
  teams,
  cycles,
  projectMembers,
  workspaceSettings,
  workspaces,
  userProfiles,
  workspaceMemberActivity,
  workspaceMembers,
} from '../../db/schema.js';
import { createWorkspaceScopeViolationError } from '../mcp/scope.js';
import { ToolExecutionContext, ToolHandler } from '../mcp/tool-handlers/types.js';
import { JsonSchema, McpToolDefinition } from '../mcp/types.js';
import { McpToolValidationError } from '../mcp/errors.js';
import { getProjectScope } from '../tickets/services/tickets.js';

/**
 * @description Workspace-member MCP handlers. These APIs only expose members
 * from the same workspace already authorized by the transport context.
 */
export class WorkspaceMemberTools {
  /**
   * @description Lists members for the authorized workspace and returns a
   * transport-friendly response shape.
   * @param args Tool arguments containing the workspace id.
   * @param context Trusted tool execution context.
   * @return The normalized workspace member list.
   * @throws When the workspace id is missing or does not match the authorized context.
   */
  async listWorkspaceMembers(args: Record<string, unknown>, context: ToolExecutionContext) {
    const requestedWorkspaceId = typeof args.workspaceId === 'string' ? args.workspaceId.trim() : '';
    const workspaceId = requestedWorkspaceId || context.workspaceId;

    if (!workspaceId) {
      throw new Error('workspaceId is required.');
    }

    if (workspaceId !== context.workspaceId) {
      throw await createWorkspaceScopeViolationError(context.workspaceId, {
        action: 'list_workspace_members',
        requestedWorkspaceId,
        actorUserId: context.actorUserId,
      });
    }

    const members = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        image: authUsers.image,
        avatarUrl: userProfiles.avatarUrl,
        role: workspaceMembers.role,
        createdAt: workspaceMembers.createdAt,
        lastActiveAt: workspaceMemberActivity.lastActiveAt,
      })
      .from(workspaceMembers)
      .innerJoin(authUsers, eq(authUsers.id, workspaceMembers.userId))
      .leftJoin(userProfiles, eq(userProfiles.userId, workspaceMembers.userId))
      .leftJoin(
        workspaceMemberActivity,
        and(
          eq(workspaceMemberActivity.userId, workspaceMembers.userId),
          eq(workspaceMemberActivity.workspaceId, workspaceMembers.workspaceId),
        ),
      )
        .where(eq(workspaceMembers.workspaceId, workspaceId))
        .orderBy(asc(workspaceMembers.createdAt));

    const workspaceOwnerRows = await db
      .select({ ownerId: workspaces.createdBy })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const ownerId = workspaceOwnerRows[0]?.ownerId;

    let normalizedMembers = members.map((member) => ({
      id: member.id,
      name: member.name,
      avatar: member.avatarUrl || member.image || '',
      role: member.role,
      createdAt: member.createdAt.toISOString(),
      lastActiveAt: member.lastActiveAt?.toISOString() || null,
    }));

    if (ownerId) {
      const ownerMember = normalizedMembers.find((member) => member.id === ownerId);
      if (ownerMember) {
        if (ownerMember.role !== 'owner') {
          normalizedMembers = normalizedMembers.map((member) =>
            member.id === ownerId ? { ...member, role: 'owner' } : member,
          );
        }
      } else {
        const ownerRecords = await db
          .select({
            id: authUsers.id,
            name: authUsers.name,
            image: authUsers.image,
            avatarUrl: userProfiles.avatarUrl,
            createdAt: workspaceMembers.createdAt,
            lastActiveAt: workspaceMemberActivity.lastActiveAt,
          })
          .from(authUsers)
          .leftJoin(
            workspaceMembers,
            and(eq(workspaceMembers.userId, authUsers.id), eq(workspaceMembers.workspaceId, workspaceId)),
          )
          .leftJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
          .leftJoin(
            workspaceMemberActivity,
            and(eq(workspaceMemberActivity.workspaceId, workspaceId), eq(workspaceMemberActivity.userId, authUsers.id)),
          )
          .where(eq(authUsers.id, ownerId))
          .limit(1);

        const ownerRecord = ownerRecords[0];
        if (ownerRecord) {
          normalizedMembers = [
            {
              id: ownerRecord.id,
              name: ownerRecord.name,
              avatar: ownerRecord.avatarUrl || ownerRecord.image || '',
              role: 'owner',
              createdAt: ownerRecord.createdAt ? ownerRecord.createdAt.toISOString() : new Date().toISOString(),
              lastActiveAt: ownerRecord.lastActiveAt ? ownerRecord.lastActiveAt.toISOString() : null,
            },
            ...normalizedMembers,
          ];
        }
      }
    }

    return normalizedMembers;
  }
}

export const workspaceMemberTools = new WorkspaceMemberTools();

export const workspaceToolHandlers: Record<string, ToolHandler> = {
  list_workspace_members: (args, context) => workspaceMemberTools.listWorkspaceMembers(args, context),
};

export const workspaceToolDefinitions: McpToolDefinition[] = [
  {
    name: 'list_workspace_members',
    description: 'Retrieve a list of members in a workspace, including their roles and last active times.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
      },
    },
  },
];


const projectFields = {
  id: projects.id, workspaceId: projects.workspaceId, teamId: projects.teamId,
  name: projects.name, description: projects.description, key: projects.key, status: projects.status,
};

async function getAuthorizedProject(args: Record<string, unknown>, context: ToolExecutionContext) {
  const [project] = await db.select(projectFields).from(projects)
    .where(and(eq(projects.id, String(args.projectId ?? '')), eq(projects.workspaceId, context.workspaceId))).limit(1);
  if (!project) throw new McpToolValidationError('Project not found in this workspace.');
  return project;
}

async function assertTeam(teamId: string, context: ToolExecutionContext) {
  const [team] = await db.select({ id: teams.id }).from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.workspaceId, context.workspaceId))).limit(1);
  if (!team) throw new McpToolValidationError('Team not found in this workspace.');
}

export const ticketStatuses = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];
export const ticketPriorities = ['no_priority', 'low', 'medium', 'high', 'urgent'];
export const ticketPrStatuses = ['none', 'open', 'merged', 'closed'];

Object.assign(workspaceToolHandlers, {
  get_workspace: async (_args: Record<string, unknown>, context: ToolExecutionContext) => {
    const [workspace] = await db.select({
      id: workspaces.id, name: workspaces.name, description: workspaces.description, key: workspaces.key,
      defaultProjectId: workspaces.defaultProjectId, hierarchyMode: workspaceSettings.hierarchyMode,
    }).from(workspaces).leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, workspaces.id))
      .where(eq(workspaces.id, context.workspaceId)).limit(1);
    if (!workspace) throw new McpToolValidationError('Workspace not found.');
    return { ...workspace, hierarchyMode: workspace.hierarchyMode ?? 'flat' };
  },
  list_projects: async (args: Record<string, unknown>, context: ToolExecutionContext) => {
    if (typeof args.teamId === 'string') await assertTeam(args.teamId, context);
    return db.select(projectFields).from(projects).where(and(eq(projects.workspaceId, context.workspaceId),
      typeof args.teamId === 'string' ? eq(projects.teamId, args.teamId) : undefined))
      .orderBy(asc(projects.name), asc(projects.id));
  },
  get_project: getAuthorizedProject,
  list_teams: async (_args: Record<string, unknown>, context: ToolExecutionContext) => db.select({
    id: teams.id, workspaceId: teams.workspaceId, name: teams.name, description: teams.description, color: teams.color,
  }).from(teams).where(eq(teams.workspaceId, context.workspaceId)).orderBy(asc(teams.name), asc(teams.id)),
  list_cycles: async (args: Record<string, unknown>, context: ToolExecutionContext) => {
    let teamId = typeof args.teamId === 'string' ? args.teamId : undefined;
    if (teamId) await assertTeam(teamId, context);
    if (typeof args.projectId === 'string') {
      const project = await getAuthorizedProject(args, context);
      if (teamId && teamId !== project.teamId) throw new McpToolValidationError('The project does not belong to the selected team.');
      teamId = project.teamId;
    }
    const rows = await db.select({ id: cycles.id, teamId: cycles.teamId, name: cycles.name, startDate: cycles.startDate,
      endDate: cycles.endDate, completed: cycles.completed }).from(cycles).innerJoin(teams, eq(teams.id, cycles.teamId))
      .where(and(eq(teams.workspaceId, context.workspaceId), teamId ? eq(cycles.teamId, teamId) : undefined,
        typeof args.completed === 'boolean' ? eq(cycles.completed, args.completed) : undefined))
      .orderBy(asc(cycles.startDate), asc(cycles.id));
    return rows.map(cycle => ({ ...cycle, startDate: cycle.startDate.toISOString(), endDate: cycle.endDate.toISOString() }));
  },
  list_ticket_options: async (args: Record<string, unknown>, context: ToolExecutionContext) => {
    if (typeof args.projectId === 'string') await getAuthorizedProject(args, context);
    return { statuses: ticketStatuses, priorities: ticketPriorities, prStatuses: ticketPrStatuses,
      nullableFields: ['assigneeId', 'cycleId', 'parentId', 'prUrl'],
      parentScope: 'same_project', cycleScope: 'project_team',
    };
  },
  list_project_assignees: async (args: Record<string, unknown>, context: ToolExecutionContext) => {
    const project = await getAuthorizedProject(args, context);
    const scope = (await getProjectScope(project.id))!;
    const members = await workspaceMemberTools.listWorkspaceMembers({}, context);
    if (scope.hierarchyMode === 'flat') return members;
    const projectMemberships = await db.select({ userId: projectMembers.userId }).from(projectMembers)
      .where(eq(projectMembers.projectId, project.id));
    const eligible = new Set(projectMemberships.map(member => member.userId));
    return members.filter(member => eligible.has(member.id));
  },
});

function discoveryTool(name: string, description: string, properties: Record<string, JsonSchema> = {}, required: string[] = []): McpToolDefinition {
  return { name, description, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties, required, additionalProperties: false } };
}
const projectIdSchema: JsonSchema = { type: 'string', minLength: 1 };
workspaceToolDefinitions.push(
  discoveryTool('get_workspace', 'Read the authorized workspace and its hierarchy mode.'),
  discoveryTool('list_projects', 'Discover projects in the authorized workspace, optionally restricted to a team.', { teamId: projectIdSchema }),
  discoveryTool('get_project', 'Read a project in the authorized workspace.', { projectId: projectIdSchema }, ['projectId']),
  discoveryTool('list_teams', 'Discover teams in the authorized workspace.'),
  discoveryTool('list_cycles', 'Discover cycles available to a project or team, or across the authorized workspace.', {
    projectId: projectIdSchema, teamId: projectIdSchema, completed: { type: 'boolean' },
  }),
  discoveryTool('list_ticket_options', 'Discover canonical ticket statuses, priorities, PR statuses, and relationship rules.', { projectId: projectIdSchema }),
  discoveryTool('list_project_assignees', 'List users eligible for assignment in a project, respecting workspace and project membership.', { projectId: projectIdSchema }, ['projectId']),
);
workspaceToolDefinitions[0].annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
workspaceToolDefinitions[0].inputSchema.additionalProperties = false;
