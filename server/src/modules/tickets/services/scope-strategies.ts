import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { projects } from '../../../db/schema.js';
import {
  authorizeProjectAccess,
  authorizeTeamAccess,
  authorizeWorkspaceAccess,
} from '../../workspaces/services/membership.js';
import { listTickets, listWorkspaceTickets, type TicketFilters } from './tickets.js';

export interface TaskScopeStrategy {
  authorize(req: any): Promise<{ allowed: boolean; error?: string; status?: number; userId?: string }>;
  execute(filters: TicketFilters): Promise<any[]>;
}

export class ProjectScopeStrategy implements TaskScopeStrategy {
  constructor(private projectId: string) {}

  async authorize(req: any) {
    const auth = await authorizeProjectAccess(req, this.projectId);
    return auth;
  }

  async execute(filters: TicketFilters) {
    return listTickets(this.projectId, filters);
  }
}

export class TeamScopeStrategy implements TaskScopeStrategy {
  constructor(private teamId: string) {}

  async authorize(req: any) {
    const auth = await authorizeTeamAccess(req, this.teamId);
    return auth;
  }

  async execute(filters: TicketFilters) {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.teamId, this.teamId));
    const projectIds = rows.map((r) => r.id);
    return listWorkspaceTickets(projectIds, filters);
  }
}

export class WorkspaceScopeStrategy implements TaskScopeStrategy {
  constructor(private workspaceId: string) {}

  async authorize(req: any) {
    const auth = await authorizeWorkspaceAccess(req, this.workspaceId);
    return auth;
  }

  async execute(filters: TicketFilters) {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, this.workspaceId));
    const projectIds = rows.map((r) => r.id);
    return listWorkspaceTickets(projectIds, filters);
  }
}
