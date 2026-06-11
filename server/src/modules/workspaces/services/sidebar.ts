import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { teams, projects, cycles, domains, workspaceSettings } from '../schema.js';
import { normalizeIsoDate } from '../../../lib/platform.js';

function mapCycle(cycle: typeof cycles.$inferSelect) {
  const now = Date.now();
  const startTime = cycle.startDate.getTime();
  const endTime = cycle.endDate.getTime();

  return {
    id: cycle.id,
    name: cycle.name,
    startDate: normalizeIsoDate(cycle.startDate),
    endDate: normalizeIsoDate(cycle.endDate),
    completed: cycle.completed ? 1 : 0,
    isActive: !cycle.completed && now >= startTime && now <= endTime,
  };
}

export async function getSidebarTree(workspaceId: string) {
  // Fetch workspace settings to get hierarchyMode
  const settingsRows = await db
    .select({ hierarchyMode: workspaceSettings.hierarchyMode })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);
  const hierarchyMode = settingsRows[0]?.hierarchyMode ?? 'flat';

  // 1. Fetch all teams in the workspace
  const workspaceTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.workspaceId, workspaceId))
    .orderBy(asc(teams.createdAt));

  // 2. Fetch all projects in the workspace
  const workspaceProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(asc(projects.createdAt));

  const teamIds = workspaceTeams.map((t) => t.id);

  // 3. Fetch all cycles in the workspace teams
  const cycleRows = teamIds.length > 0
    ? await db.select().from(cycles).where(inArray(cycles.teamId, teamIds)).orderBy(asc(cycles.startDate))
    : [];

  // 4. Fetch all domains in the workspace teams
  const domainRows = teamIds.length > 0
    ? await db.select().from(domains).where(inArray(domains.teamId, teamIds)).orderBy(asc(domains.createdAt))
    : [];

  // Group by teamId
  const projectsByTeam = new Map<string, Array<typeof projects.$inferSelect>>();
  for (const project of workspaceProjects) {
    if (project.teamId) {
      const list = projectsByTeam.get(project.teamId) ?? [];
      list.push(project);
      projectsByTeam.set(project.teamId, list);
    }
  }

  const cyclesByTeam = new Map<string, Array<typeof cycles.$inferSelect>>();
  for (const cycle of cycleRows) {
    if (cycle.teamId) {
      const list = cyclesByTeam.get(cycle.teamId) ?? [];
      list.push(cycle);
      cyclesByTeam.set(cycle.teamId, list);
    }
  }

  const domainsByTeam = new Map<string, Array<typeof domains.$inferSelect>>();
  for (const domain of domainRows) {
    if (domain.teamId) {
      const list = domainsByTeam.get(domain.teamId) ?? [];
      list.push(domain);
      domainsByTeam.set(domain.teamId, list);
    }
  }

  // Build the tree
  const teamTrees = workspaceTeams.map((team) => {
    const teamProjects = projectsByTeam.get(team.id) ?? [];
    const teamCycles = cyclesByTeam.get(team.id) ?? [];
    const teamDomains = domainsByTeam.get(team.id) ?? [];

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      color: team.color,
      views: [
        { id: 'all', name: 'All Tasks', type: 'all' },
        { id: 'board', name: 'Board', type: 'board' },
        { id: 'timeline', name: 'Timeline', type: 'timeline' },
      ],
      cycles: teamCycles.map(mapCycle),
      domains: teamDomains.map((d) => ({
        id: d.id,
        name: d.name,
        color: d.color,
      })),
      projects: teamProjects.map((p) => ({
        id: p.id,
        name: p.name,
        key: p.key,
        description: p.description,
        status: p.status,
        githubRepoUrl: p.githubRepoUrl,
      })),
    };
  });

  return {
    workspaceId,
    hierarchyMode,
    teams: teamTrees,
  };
}
