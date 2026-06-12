import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { projects, teams } from '../../src/db/schema.js';
import { getDefaultTeamId } from '../../src/modules/workspaces/utils/default-team.js';
import {
  ProjectScopeStrategy,
  TeamScopeStrategy,
  WorkspaceScopeStrategy,
} from '../../src/modules/tickets/services/scope-strategies.js';
import { seedTicket, seedWorkspaceFixture } from '../helpers/test-helpers.js';

describe('ticket scope strategies', () => {
  it('separates project, team, and workspace aggregate ticket scopes', async () => {
    const { owner, workspace, project } = await seedWorkspaceFixture();
    const engineeringTeamId = getDefaultTeamId(workspace.id);
    const designTeamId = 'team-design';

    await db.insert(teams).values({
      id: designTeamId,
      workspaceId: workspace.id,
      name: 'Design',
      description: '',
      color: '#f97316',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(projects).values([
      {
        id: 'project-api',
        workspaceId: workspace.id,
        teamId: engineeringTeamId,
        name: 'API',
        description: 'API project',
        key: 'API',
        status: 'active',
        inviteCode: 'INV-API-0001',
        createdBy: owner.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'project-design',
        workspaceId: workspace.id,
        teamId: designTeamId,
        name: 'Design System',
        description: 'Design project',
        key: 'DSN',
        status: 'active',
        inviteCode: 'INV-DSN-0001',
        createdBy: owner.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await seedTicket(project.id, {
      id: 'ticket-core',
      key: `${project.key}-1`,
      title: 'Core project task',
    });
    await seedTicket('project-api', {
      id: 'ticket-api',
      key: 'API-1',
      title: 'API project task',
    });
    await seedTicket('project-design', {
      id: 'ticket-design',
      key: 'DSN-1',
      title: 'Design team task',
    });

    const projectTickets = await new ProjectScopeStrategy(project.id).execute({});
    expect(projectTickets.map((ticket) => ticket.id)).toEqual(['ticket-core']);

    const teamTickets = await new TeamScopeStrategy(engineeringTeamId).execute({});
    expect(teamTickets.map((ticket) => ticket.id).sort()).toEqual(['ticket-api', 'ticket-core']);

    const workspaceTickets = await new WorkspaceScopeStrategy(workspace.id).execute({});
    expect(workspaceTickets.map((ticket) => ticket.id).sort()).toEqual([
      'ticket-api',
      'ticket-core',
      'ticket-design',
    ]);
  });
});
