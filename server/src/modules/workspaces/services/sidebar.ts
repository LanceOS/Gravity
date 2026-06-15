import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { teams, projects, cycles, labels, workspaceSettings } from '../schema.js';
import * as cache from '../../../lib/cache.js';
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
  const cacheKey = cache.CacheKeys.workspaces.sidebar(workspaceId);
  return cache.wrap(cacheKey, 60, async () => {
    // Fetch settings, teams, and projects in parallel before composing the tree.
    const [settingsRows, workspaceTeams, workspaceProjects] = await Promise.all([
      db
        .select({ hierarchyMode: workspaceSettings.hierarchyMode })
        .from(workspaceSettings)
        .where(eq(workspaceSettings.workspaceId, workspaceId))
        .limit(1),
      db
        .select({
          id: teams.id,
          name: teams.name,
          description: teams.description,
          color: teams.color,
        })
        .from(teams)
        .where(eq(teams.workspaceId, workspaceId))
        .orderBy(asc(teams.createdAt)),
      db
        .select({
          id: projects.id,
          name: projects.name,
          key: projects.key,
          description: projects.description,
          status: projects.status,
          teamId: projects.teamId,
          githubRepoUrl: projects.githubRepoUrl,
        })
        .from(projects)
        .where(eq(projects.workspaceId, workspaceId))
        .orderBy(asc(projects.createdAt)),
    ]);
    const hierarchyMode = settingsRows[0]?.hierarchyMode ?? 'flat';

    const teamIds = workspaceTeams.map((t) => t.id);

    // 3/4. Fetch all cycles and labels in parallel for workspace teams.
    const [cycleRows, labelRows] = teamIds.length > 0
      ? await Promise.all([
          db
            .select({
              id: cycles.id,
              name: cycles.name,
              startDate: cycles.startDate,
              endDate: cycles.endDate,
              completed: cycles.completed,
              teamId: cycles.teamId,
            })
            .from(cycles)
            .where(inArray(cycles.teamId, teamIds))
            .orderBy(asc(cycles.startDate)),
          db
            .select({
              id: labels.id,
              teamId: labels.teamId,
              name: labels.name,
              color: labels.color,
              description: labels.description,
              sortOrder: labels.sortOrder,
            })
            .from(labels)
            .where(inArray(labels.teamId, teamIds))
            .orderBy(asc(labels.createdAt)),
        ])
      : [[], []];

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

    const labelsByTeam = new Map<string, Array<typeof labels.$inferSelect>>();
    for (const label of labelRows) {
      if (label.teamId) {
        const list = labelsByTeam.get(label.teamId) ?? [];
        list.push(label);
        labelsByTeam.set(label.teamId, list);
      }
    }

    // Build the tree
    const teamTrees = workspaceTeams.map((team) => {
      const teamProjects = projectsByTeam.get(team.id) ?? [];
      const teamCycles = cyclesByTeam.get(team.id) ?? [];
      const teamLabels = labelsByTeam.get(team.id) ?? [];

      return {
        id: team.id,
        name: team.name,
        description: team.description,
        color: team.color,
        views: [
          { id: 'all', name: 'All Tasks', type: 'all' },
          { id: 'timeline', name: 'Timeline', type: 'timeline' },
        ],
        cycles: teamCycles.map(mapCycle),
        labels: teamLabels.map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
          description: l.description,
          sortOrder: l.sortOrder,
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
  });
}
